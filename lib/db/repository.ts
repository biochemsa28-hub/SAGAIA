import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { StoryOutput } from "@/lib/validators/story.schema";
import { FREE_SIGNUP_NAVOS } from "@/lib/config";

// ─── Users ────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  plan: string;
  credits: number;
  created_at: string;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, email, name, password_hash, plan, credits, created_at FROM users WHERE email = ?",
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return row as unknown as DbUser;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, email, name, password_hash, plan, credits, created_at FROM users WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return row as unknown as DbUser;
}

export async function createUser(params: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<DbUser> {
  const db = getDb();
  const id = uuidv4();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, plan, credits) VALUES (?, ?, ?, ?, 'free', ?)",
    args: [id, params.email, params.name, params.passwordHash, FREE_SIGNUP_NAVOS],
  });
  return {
    id,
    email: params.email,
    name: params.name,
    password_hash: params.passwordHash,
    plan: "free",
    credits: FREE_SIGNUP_NAVOS,
    created_at: new Date().toISOString(),
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getUserSettings(userId: string): Promise<{
  name: string | null;
  email: string;
  plan: string;
  credits: number;
  has_openai_key: boolean;
  has_eleven_key: boolean;
}> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT name, email, plan, credits, openai_key_enc, eleven_key_enc FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("User not found");
  return {
    name: (row["name"] as string | null) ?? null,
    email: row["email"] as string,
    plan: row["plan"] as string,
    credits: Number(row["credits"] ?? 0),
    has_openai_key: Boolean(row["openai_key_enc"]),
    has_eleven_key: Boolean(row["eleven_key_enc"]),
  };
}

export async function getEncryptedKeys(userId: string): Promise<{
  openai_key_enc: string | null;
  eleven_key_enc: string | null;
}> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT openai_key_enc, eleven_key_enc FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return {
    openai_key_enc: (row?.["openai_key_enc"] as string | null) ?? null,
    eleven_key_enc: (row?.["eleven_key_enc"] as string | null) ?? null,
  };
}

export async function updateUserProfile(userId: string, params: {
  name?: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?",
    args: [params.name ?? null, userId],
  });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    args: [passwordHash, userId],
  });
}

export async function updateApiKeys(userId: string, params: {
  openai_key_enc?: string | null;
  eleven_key_enc?: string | null;
}): Promise<void> {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const args: (string | null)[] = [];
  if (params.openai_key_enc !== undefined) {
    sets.push("openai_key_enc = ?");
    args.push(params.openai_key_enc);
  }
  if (params.eleven_key_enc !== undefined) {
    sets.push("eleven_key_enc = ?");
    args.push(params.eleven_key_enc);
  }
  args.push(userId);
  await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args });
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function getUserCredits(userId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT credits FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return Number(row?.["credits"] ?? 0);
}

export async function deductCredit(userId: string): Promise<{ ok: boolean; remaining: number }> {
  const db = getDb();
  // Atomic check-and-decrement — only deducts if credits > 0
  const result = await db.execute({
    sql: "UPDATE users SET credits = credits - 1, updated_at = datetime('now') WHERE id = ? AND credits > 0 RETURNING credits",
    args: [userId],
  });
  if (result.rows.length === 0) {
    const current = await getUserCredits(userId);
    return { ok: false, remaining: current };
  }
  const row = result.rows[0] as Record<string, unknown>;
  return { ok: true, remaining: Number(row["credits"] ?? 0) };
}

// Atomic check-and-decrement for an arbitrary amount — only deducts if the user
// has at least `amount` credits. Used so premium tiers can cost more than 1 NAVO.
export async function deductCredits(userId: string, amount: number): Promise<{ ok: boolean; remaining: number }> {
  const n = Math.max(1, Math.floor(amount));
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE users SET credits = credits - ?, updated_at = datetime('now') WHERE id = ? AND credits >= ? RETURNING credits",
    args: [n, userId, n],
  });
  if (result.rows.length === 0) {
    return { ok: false, remaining: await getUserCredits(userId) };
  }
  const row = result.rows[0] as Record<string, unknown>;
  return { ok: true, remaining: Number(row["credits"] ?? 0) };
}

// Refund the credits spent on a project after a failed production.
// Atomic + idempotent: only refunds once per project (credit_refunded guard wins
// the race), and only when the project genuinely has no final video deliverable.
// Refunds the EXACT amount stored in projects.credits_spent (tier-aware).
export async function refundCreditForProject(
  userId: string,
  projectId: string,
): Promise<{ refunded: boolean; remaining: number }> {
  const db = getDb();

  // Don't refund if a final video already exists (production actually succeeded).
  const hasVideo = await db.execute({
    sql: "SELECT 1 FROM assets WHERE project_id = ? AND asset_type = 'final_video' LIMIT 1",
    args: [projectId],
  });
  if (hasVideo.rows.length > 0) {
    return { refunded: false, remaining: await getUserCredits(userId) };
  }

  // Atomically claim the refund slot — only one caller can flip 0 → 1.
  // Return credits_spent so we refund exactly what was charged.
  const claim = await db.execute({
    sql: "UPDATE projects SET credit_refunded = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND credit_refunded = 0 RETURNING credits_spent",
    args: [projectId, userId],
  });
  if (claim.rows.length === 0) {
    // Already refunded (or not the owner) — no-op.
    return { refunded: false, remaining: await getUserCredits(userId) };
  }

  const spent = Number((claim.rows[0] as Record<string, unknown>)["credits_spent"] ?? 1) || 1;
  const remaining = await addCredits(userId, spent);
  return { refunded: true, remaining };
}

// ─── Recurring Characters (the moat) ───────────────────────────────────────────

export interface DbCharacter {
  id: string;
  user_id: string;
  name: string;
  description: string;
  archetype: string | null;
  visual_prompt: string | null;
  voice_style: string | null;
  reference_image_url: string | null;
  niche: string | null;
  created_at: string;
}

export async function createCharacter(params: {
  userId: string;
  name: string;
  description: string;
  archetype?: string | null;
  visualPrompt?: string | null;
  voiceStyle?: string | null;
  referenceImageUrl?: string | null;
  niche?: string | null;
}): Promise<DbCharacter> {
  const db = getDb();
  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO characters (id, user_id, name, description, archetype, visual_prompt, voice_style, reference_image_url, niche, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      id, params.userId, params.name, params.description,
      params.archetype ?? null, params.visualPrompt ?? null, params.voiceStyle ?? null,
      params.referenceImageUrl ?? null, params.niche ?? null,
    ],
  });
  const c = await getCharacter(id, params.userId);
  if (!c) throw new Error("Failed to create character");
  return c;
}

export async function listCharacters(userId: string): Promise<DbCharacter[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM characters WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, created_at)) DESC",
    args: [userId],
  });
  return result.rows as unknown as DbCharacter[];
}

export async function getCharacter(id: string, userId: string): Promise<DbCharacter | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM characters WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return (result.rows[0] as unknown as DbCharacter) ?? null;
}

export async function deleteCharacter(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM characters WHERE id = ? AND user_id = ? RETURNING id",
    args: [id, userId],
  });
  return result.rows.length > 0;
}

// Link a project to a saved character so its scenes reuse that character's look.
export async function setProjectCharacter(projectId: string, userId: string, characterId: string | null): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE projects SET character_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    args: [characterId, projectId, userId],
  });
}

// ─── Project Cast (Phase 4) ─────────────────────────────────────────────────
// The cast chosen for ONE project: name → selected portrait + voice archetype.
// Used at production time to give each scene's speaker the right face and voice.

export interface DbCastMember {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  voice_profile: string | null;
  reference_image_url: string | null;
  bible_url: string | null;   // multi-view reference sheet (generated once, reused)
}

// Replace the whole cast for a project (idempotent — clears then inserts).
export async function setProjectCast(
  projectId: string,
  members: Array<{ name: string; role?: string | null; voice_profile?: string | null; reference_image_url?: string | null; bible_url?: string | null }>,
): Promise<void> {
  const db = getDb();
  await db.execute({ sql: "DELETE FROM project_cast WHERE project_id = ?", args: [projectId] });
  for (const m of members) {
    if (!m.name) continue;
    await db.execute({
      // bible_url carries over from a previous episode so a series never pays to
      // rebuild the same character sheet twice.
      sql: `INSERT INTO project_cast (id, project_id, name, role, voice_profile, reference_image_url, bible_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [uuidv4(), projectId, m.name, m.role ?? null, m.voice_profile ?? null, m.reference_image_url ?? null, m.bible_url ?? null],
    });
  }
}

export async function getProjectCast(projectId: string): Promise<DbCastMember[]> {
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM project_cast WHERE project_id = ?",
    args: [projectId],
  });
  return res.rows as unknown as DbCastMember[];
}

// Persist a character's generated multi-view bible so every later scene — and every
// later EPISODE — reuses the same reference instead of paying to rebuild it.
export async function setCastBible(castId: string, bibleUrl: string): Promise<void> {
  const db = getDb();
  await db.execute({ sql: "UPDATE project_cast SET bible_url = ? WHERE id = ?", args: [bibleUrl, castId] });
}

export async function addCredits(userId: string, amount: number): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE users SET credits = credits + ?, updated_at = datetime('now') WHERE id = ? RETURNING credits",
    args: [amount, userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return Number(row?.["credits"] ?? 0);
}

export async function updateUserPlan(userId: string, plan: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE users SET plan = ?, updated_at = datetime('now') WHERE id = ?",
    args: [plan, userId],
  });
}

// ─── API Logs ─────────────────────────────────────────────────────────────────

export async function createApiLog(params: {
  userId?: string;
  projectId?: string;
  provider: string;
  endpoint: string;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  statusCode?: number;
  error?: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO api_logs (id, user_id, project_id, provider, endpoint, model, tokens_used, cost_usd, duration_ms, status_code, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      uuidv4(),
      params.userId ?? null,
      params.projectId ?? null,
      params.provider,
      params.endpoint,
      params.model ?? null,
      params.tokensUsed ?? 0,
      params.costUsd ?? 0,
      params.durationMs ?? null,
      params.statusCode ?? 200,
      params.error ?? null,
    ],
  });
}

export async function getApiLogs(userId: string, limit = 50): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT l.*, p.title as project_title
          FROM api_logs l
          LEFT JOIN projects p ON p.id = l.project_id
          WHERE l.user_id = ?
          ORDER BY l.created_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows as unknown as Record<string, unknown>[];
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface DbProject {
  id: string;
  user_id: string;
  title: string;
  niche: string;
  sub_niche: string | null;
  topic: string;
  tone: string;
  duration_target: string;
  language: string;
  visual_style: string;
  status: string;
  ai_provider: string;
  error_message: string | null;
  character_id: string | null;
  animation_tier: string | null;
  reference_image_url: string | null;
  reference_image_urls: string | null;  // JSON array of extra product images
  series_id: string | null;             // groups all episodes of one story
  episode_number: number;               // 1 for a standalone / first episode
  parent_project_id: string | null;     // the episode this one continues
  created_at: string;
  updated_at: string;
  // joined fields
  scene_count?: number;
  thumbnail_url?: string | null;
  final_video_url?: string | null;
  has_voice?: number;
  has_images?: number;
  has_clips?: number;
  has_final?: number;
}

export async function createProject(params: {
  userId: string;
  title: string;
  niche: string;
  subNiche?: string;
  topic: string;
  tone: string;
  durationTarget: string;
  language: string;
  visualStyle: string;
  aiProvider: string;
  animationTier?: string | null;
  creditsSpent?: number;
  referenceImageUrl?: string | null;
  referenceImageUrls?: string[] | null;
  seriesId?: string | null;
  episodeNumber?: number;
  parentProjectId?: string | null;
}): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO projects
      (id, user_id, title, niche, sub_niche, topic, tone, duration_target, language, visual_style, status, ai_provider, animation_tier, credits_spent, reference_image_url, reference_image_urls, series_id, episode_number, parent_project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, params.userId, params.title, params.niche,
      params.subNiche ?? null, params.topic, params.tone,
      params.durationTarget, params.language, params.visualStyle,
      params.aiProvider, params.animationTier ?? null,
      Math.max(1, Math.floor(params.creditsSpent ?? 1)),
      params.referenceImageUrl ?? null,
      params.referenceImageUrls?.length ? JSON.stringify(params.referenceImageUrls) : null,
      // A standalone project starts its OWN series (series_id = its own id) so any
      // project can spawn a Part 2 later without a migration step.
      params.seriesId ?? id,
      Math.max(1, Math.floor(params.episodeNumber ?? 1)),
      params.parentProjectId ?? null,
    ],
  });
  return id;
}

// ── Series helpers ───────────────────────────────────────────────────────────

// Everything the next episode needs to continue the story faithfully: the cast
// (same faces + voices), the previous script, and where the cliffhanger left off.
export async function getEpisodeContext(projectId: string, userId: string): Promise<{
  project: DbProject;
  cast: Array<{ name: string; role: string | null; voice_profile: string | null; reference_image_url: string | null; bible_url: string | null }>;
  lastLines: string[];
  cta: string | null;
  nextEpisode: number;
} | null> {
  const db = getDb();
  const p = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ? AND user_id = ? LIMIT 1",
    args: [projectId, userId],
  });
  if (!p.rows.length) return null;
  const project = p.rows[0] as unknown as DbProject;

  const cast = (await db.execute({
    sql: "SELECT name, role, voice_profile, reference_image_url, bible_url FROM project_cast WHERE project_id = ?",
    args: [projectId],
  })).rows as unknown as Array<{ name: string; role: string | null; voice_profile: string | null; reference_image_url: string | null; bible_url: string | null }>;

  // The final beats — the next episode has to pick up exactly here.
  const scenes = (await db.execute({
    sql: "SELECT narration_text FROM scenes WHERE project_id = ? ORDER BY scene_number DESC LIMIT 3",
    args: [projectId],
  })).rows as Array<Record<string, unknown>>;
  const lastLines = scenes.reverse().map((s) => String(s.narration_text ?? "")).filter(Boolean);

  const story = await db.execute({ sql: "SELECT cta FROM stories WHERE project_id = ? LIMIT 1", args: [projectId] });
  const cta = story.rows.length ? String((story.rows[0] as Record<string, unknown>).cta ?? "") || null : null;

  // Next episode number = highest in the series + 1.
  const seriesId = project.series_id ?? projectId;
  const maxEp = await db.execute({
    sql: "SELECT COALESCE(MAX(episode_number), 0) n FROM projects WHERE series_id = ? AND user_id = ?",
    args: [seriesId, userId],
  });
  const nextEpisode = Number((maxEp.rows[0] as Record<string, unknown>)?.n ?? 1) + 1;

  return { project, cast, lastLines, cta, nextEpisode };
}

// All episodes of a series, in order — powers the series view in the library.
export async function getSeriesEpisodes(seriesId: string, userId: string): Promise<DbProject[]> {
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT * FROM projects WHERE series_id = ? AND user_id = ? ORDER BY episode_number ASC",
    args: [seriesId, userId],
  });
  return r.rows as unknown as DbProject[];
}

// Delete a project and all its child rows. Ownership-checked: only removes when
// the project belongs to the user. Returns true if a project was actually deleted.
export async function deleteProject(projectId: string, userId: string): Promise<boolean> {
  const db = getDb();
  // Verify ownership first.
  const owns = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ? LIMIT 1",
    args: [projectId, userId],
  });
  if (owns.rows.length === 0) return false;

  // Delete children FIRST, in dependency order. Some FKs (assets.scene_id,
  // jobs.project_id, api_logs.project_id) are NOT declared ON DELETE CASCADE, so
  // the project row can't be removed until these are cleared by hand.
  //  assets → scenes → stories (scenes.story_id), plus seo/cast/jobs/logs.
  await db.execute({ sql: "DELETE FROM assets WHERE project_id = ?", args: [projectId] });
  await db.execute({ sql: "DELETE FROM scenes WHERE project_id = ?", args: [projectId] });
  await db.execute({ sql: "DELETE FROM seo_packages WHERE project_id = ?", args: [projectId] });
  await db.execute({ sql: "DELETE FROM stories WHERE project_id = ?", args: [projectId] });
  // Tables that may not exist on older DBs — guard individually.
  for (const sql of [
    "DELETE FROM project_cast WHERE project_id = ?",
    "DELETE FROM jobs WHERE project_id = ?",
    "DELETE FROM api_logs WHERE project_id = ?",
  ]) {
    try { await db.execute({ sql, args: [projectId] }); } catch { /* table may not exist */ }
  }
  await db.execute({ sql: "DELETE FROM projects WHERE id = ? AND user_id = ?", args: [projectId, userId] });
  return true;
}

export async function updateProjectStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE projects SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?",
    args: [status, errorMessage ?? null, id],
  });
}

export async function getProjectsByUser(userId: string): Promise<DbProject[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT p.*,
            COUNT(s.id) as scene_count,
            (SELECT a.public_url FROM assets a
             WHERE a.project_id = p.id AND a.asset_type = 'image'
             ORDER BY a.created_at ASC LIMIT 1) as thumbnail_url,
            (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.asset_type = 'audio')  as has_voice,
            (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.asset_type = 'image')  as has_images,
            (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.asset_type = 'video')  as has_clips,
            (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id AND a.asset_type = 'final_video') as has_final
          FROM projects p
          LEFT JOIN scenes s ON s.project_id = p.id
          WHERE p.user_id = ?
          GROUP BY p.id
          ORDER BY p.created_at DESC
          LIMIT 50`,
    args: [userId],
  });
  return result.rows as unknown as DbProject[];
}

export async function getProjectById(id: string, userId: string): Promise<DbProject | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return row as unknown as DbProject;
}

// ─── Stories + Scenes + SEO (save full generation result) ─────────────────────

export async function saveGenerationResult(params: {
  projectId: string;
  story: StoryOutput;
  rawAiResponse: string;
  aiProvider: string;
}): Promise<void> {
  const db = getDb();
  const { projectId, story, rawAiResponse, aiProvider } = params;

  const storyId = uuidv4();

  await db.execute({
    sql: `INSERT INTO stories
      (id, project_id, hook, full_narrative, cta, total_duration_seconds, scene_count, voice_style, music_mood, raw_ai_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      storyId, projectId,
      story.story.hook, story.story.full_narrative, story.story.cta,
      story.production_notes.total_duration_seconds, story.scenes.length,
      story.production_notes.voice_style ?? null,
      story.production_notes.music_mood ?? null,
      rawAiResponse,
    ],
  });

  for (const scene of story.scenes) {
    await db.execute({
      sql: `INSERT INTO scenes
        (id, project_id, story_id, scene_number, narration_text, duration_seconds, image_prompt, animation_prompt, emotion, camera_move, speaker, voice_profile, sfx_prompt, speaker_look, location, environment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuidv4(), projectId, storyId, scene.scene_number,
        scene.narration_text, scene.duration_seconds,
        scene.image_prompt ?? null, scene.animation_prompt ?? null,
        scene.emotion ?? null, scene.camera_move ?? null,
        scene.speaker ?? null, scene.voice_profile ?? null,
        scene.sfx_prompt || null,
        scene.speaker_look || null,
        scene.location || null,
        scene.environment || null,
      ],
    });
  }

  if (story.seo) {
    await db.execute({
      sql: `INSERT INTO seo_packages
        (id, project_id, title, description, hashtags, tags, thumbnail_concept, thumbnail_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuidv4(), projectId, story.seo.title, story.seo.description,
        JSON.stringify(story.seo.hashtags), JSON.stringify(story.seo.tags),
        story.seo.thumbnail_concept ?? null, story.seo.thumbnail_prompt ?? null,
      ],
    });
  }

  await updateProjectStatus(projectId, "ready");

  await db.execute({
    sql: "UPDATE projects SET ai_provider = ?, updated_at = datetime('now') WHERE id = ?",
    args: [aiProvider, projectId],
  });
}

// ─── Project Full Detail ──────────────────────────────────────────────────────

export interface DbStory {
  id: string;
  project_id: string;
  hook: string;
  full_narrative: string;
  cta: string;
  total_duration_seconds: number;
  scene_count: number;
  voice_style: string | null;
  music_mood: string | null;
  created_at: string;
}

export interface DbScene {
  id: string;
  scene_number: number;
  narration_text: string;
  duration_seconds: number;
  image_prompt: string | null;
  animation_prompt: string | null;
  emotion: string | null;
  camera_move: string | null;
  speaker: string | null;
  voice_profile: string | null;
  sfx_prompt: string | null;    // el ruido concreto de esta escena (puerta, vidrio, pasos)
  speaker_look: string | null;  // cómo se ve quien habla, para que el modelo lo distinga
  location: string | null;      // dónde transcurre; decide encadenado vs corte limpio
  environment: string | null;   // qué se mueve en el ambiente (lluvia, cortina, humo)
}

export interface DbSeoPackage {
  id: string;
  title: string;
  description: string;
  hashtags: string; // JSON array string
  tags: string;     // JSON array string
  thumbnail_concept: string | null;
  thumbnail_prompt: string | null;
}

export interface ProjectDetail {
  project: DbProject;
  story: DbStory | null;
  scenes: DbScene[];
  seo: DbSeoPackage | null;
  assets: DbAsset[];
}

export async function getProjectDetail(id: string, userId: string): Promise<ProjectDetail | null> {
  const db = getDb();

  const projectRes = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  const project = projectRes.rows[0] as unknown as DbProject | undefined;
  if (!project) return null;

  const [storyRes, scenesRes, seoRes] = await Promise.all([
    db.execute({ sql: "SELECT * FROM stories WHERE project_id = ?", args: [id] }),
    db.execute({ sql: "SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_number ASC", args: [id] }),
    db.execute({ sql: "SELECT * FROM seo_packages WHERE project_id = ?", args: [id] }),
  ]);

  const assetsRes = await db.execute({
    sql: "SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC",
    args: [id],
  });

  return {
    project,
    story: (storyRes.rows[0] as unknown as DbStory) ?? null,
    scenes: storyRes.rows[0] ? (scenesRes.rows as unknown as DbScene[]) : [],
    seo: (seoRes.rows[0] as unknown as DbSeoPackage) ?? null,
    assets: assetsRes.rows as unknown as DbAsset[],
  };
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface DbAsset {
  id: string;
  project_id: string;
  scene_id: string | null;
  asset_type: string;  // audio|image|video|thumbnail|zip
  status: string;
  file_path: string | null;
  public_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  metadata: string | null;
  created_at: string;
}

export async function upsertAsset(params: {
  projectId: string;
  sceneNumber?: number;
  assetType: string;
  publicUrl: string;
  filePath?: string;
  mimeType?: string;
  metadata?: string;  // JSON: word timings, duration, etc.
}): Promise<void> {
  const db = getDb();

  // Find scene_id if sceneNumber provided
  let sceneId: string | null = null;
  if (params.sceneNumber !== undefined) {
    const res = await db.execute({
      sql: "SELECT id FROM scenes WHERE project_id = ? AND scene_number = ?",
      args: [params.projectId, params.sceneNumber],
    });
    sceneId = (res.rows[0] as Record<string, unknown>)?.["id"] as string ?? null;
  }

  // Upsert: if asset exists for this project+scene+type, update it
  const existing = await db.execute({
    sql: "SELECT id FROM assets WHERE project_id = ? AND scene_id = ? AND asset_type = ?",
    args: [params.projectId, sceneId, params.assetType],
  });

  if (existing.rows[0]) {
    const assetId = (existing.rows[0] as Record<string, unknown>)["id"] as string;
    await db.execute({
      sql: "UPDATE assets SET public_url = ?, file_path = ?, status = 'done', metadata = COALESCE(?, metadata), updated_at = datetime('now') WHERE id = ?",
      args: [params.publicUrl, params.filePath ?? null, params.metadata ?? null, assetId],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO assets (id, project_id, scene_id, asset_type, status, public_url, file_path, mime_type, metadata)
            VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?)`,
      args: [uuidv4(), params.projectId, sceneId, params.assetType,
             params.publicUrl, params.filePath ?? null, params.mimeType ?? null, params.metadata ?? null],
    });
  }
}

// ─── Project Stats (for dashboard) ────────────────────────────────────────────

export async function getUserStats(userId: string): Promise<{
  total: number;
  ready: number;
  generating: number;
  scenes: number;
}> {
  const db = getDb();
  const [totals, scenes] = await Promise.all([
    db.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
              SUM(CASE WHEN status IN ('generating','script_generated','prompts_generated') THEN 1 ELSE 0 END) as generating
            FROM projects WHERE user_id = ?`,
      args: [userId],
    }),
    db.execute({
      sql: "SELECT COUNT(*) as cnt FROM scenes s JOIN projects p ON p.id = s.project_id WHERE p.user_id = ?",
      args: [userId],
    }),
  ]);
  const row = totals.rows[0] as Record<string, unknown>;
  const sceneRow = scenes.rows[0] as Record<string, unknown>;
  return {
    total: Number(row?.["total"] ?? 0),
    ready: Number(row?.["ready"] ?? 0),
    generating: Number(row?.["generating"] ?? 0),
    scenes: Number(sceneRow?.["cnt"] ?? 0),
  };
}

// ── Daily production kill-switch ─────────────────────────────────────────────
// Atomically increments today's video-production counter and returns the new
// count. Callers compare against MAX_DAILY_VIDEOS to block runaway spend.
// Uses app_meta as a simple KV; the UPSERT is atomic so concurrent calls are safe.
export async function bumpDailyVideoCount(): Promise<number> {
  const db = getDb();
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const key = `video_count_${day}`;
  const res = await db.execute({
    sql: `INSERT INTO app_meta (key, value) VALUES (?, '1')
          ON CONFLICT(key) DO UPDATE SET value = CAST(app_meta.value AS INTEGER) + 1
          RETURNING value`,
    args: [key],
  });
  return Number((res.rows[0] as Record<string, unknown>)?.["value"] ?? 1) || 1;
}

// Read-only peek at today's count (for a status/health endpoint).
export async function getDailyVideoCount(): Promise<number> {
  const db = getDb();
  const day = new Date().toISOString().slice(0, 10);
  const r = await db.execute({ sql: "SELECT value FROM app_meta WHERE key = ?", args: [`video_count_${day}`] });
  return Number((r.rows[0] as Record<string, unknown>)?.["value"] ?? 0) || 0;
}

// ─── Job queue ────────────────────────────────────────────────────────────────
// Durable production jobs. The point of every function here is that a job survives
// the process that started it: if the server dies mid-render, the row is still on
// disk with enough state to be re-claimed instead of silently disappearing.

export interface DbJob {
  id: string;
  project_id: string;
  user_id: string;
  job_type: string;
  status: "queued" | "processing" | "done" | "failed";
  payload: string;
  result: string | null;
  error_message: string | null;
  stage: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
}

// Enqueue production for a project. Idempotent per project: if one is already
// queued or running we return it instead of paying twice for the same video.
export async function enqueueJob(params: {
  projectId: string;
  userId: string;
  jobType?: string;
  payload?: Record<string, unknown>;
}): Promise<{ job: DbJob; created: boolean }> {
  const db = getDb();
  const jobType = params.jobType ?? "produce";
  const existing = await db.execute({
    sql: `SELECT * FROM jobs WHERE project_id = ? AND job_type = ? AND status IN ('queued','processing')
          ORDER BY created_at DESC LIMIT 1`,
    args: [params.projectId, jobType],
  });
  if (existing.rows.length) return { job: existing.rows[0] as unknown as DbJob, created: false };

  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO jobs (id, project_id, user_id, job_type, status, payload)
          VALUES (?, ?, ?, ?, 'queued', ?)`,
    args: [id, params.projectId, params.userId, jobType, JSON.stringify(params.payload ?? {})],
  });
  const r = await db.execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
  return { job: r.rows[0] as unknown as DbJob, created: true };
}

// Atomically take the oldest queued job. The UPDATE ... WHERE status='queued'
// RETURNING is the whole lock: two workers racing for the same row, only one
// UPDATE matches, so the loser gets zero rows and moves on. No advisory locks,
// no window between read and write.
export async function claimNextJob(): Promise<DbJob | null> {
  const db = getDb();
  const next = await db.execute({
    sql: "SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1",
    args: [],
  });
  const id = (next.rows[0] as Record<string, unknown> | undefined)?.["id"] as string | undefined;
  if (!id) return null;

  const claimed = await db.execute({
    sql: `UPDATE jobs SET status = 'processing', attempts = attempts + 1,
            started_at = COALESCE(started_at, datetime('now')), heartbeat_at = datetime('now')
          WHERE id = ? AND status = 'queued' RETURNING *`,
    args: [id],
  });
  return claimed.rows.length ? (claimed.rows[0] as unknown as DbJob) : null;
}

// Proof of life. A job whose heartbeat stops is a job whose process died.
export async function heartbeatJob(jobId: string, stage?: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: stage
      ? "UPDATE jobs SET heartbeat_at = datetime('now'), stage = ? WHERE id = ?"
      : "UPDATE jobs SET heartbeat_at = datetime('now') WHERE id = ?",
    args: stage ? [stage, jobId] : [jobId],
  });
}

export async function completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE jobs SET status = 'done', stage = 'done', completed_at = datetime('now'), result = ?
          WHERE id = ?`,
    args: [result ? JSON.stringify(result) : null, jobId],
  });
}

// A failure is only terminal once the job is out of attempts. Below that it goes
// back to 'queued' and another pass picks it up — most production failures are a
// timed-out upstream call, not a broken project.
// `opts.terminal` forces the failure to be final regardless of attempts left —
// for errors where a retry provably cannot succeed (a continuity block reads the
// same idempotent images again and fails identically).
export async function failJob(jobId: string, error: string, opts?: { terminal?: boolean }): Promise<{ terminal: boolean }> {
  const db = getDb();
  const r = await db.execute({ sql: "SELECT attempts, max_attempts FROM jobs WHERE id = ?", args: [jobId] });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  const attempts = Number(row?.["attempts"] ?? 0);
  const max = Number(row?.["max_attempts"] ?? 3);
  const terminal = opts?.terminal === true || attempts >= max;
  await db.execute({
    sql: terminal
      ? `UPDATE jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`
      : `UPDATE jobs SET status = 'queued', error_message = ? WHERE id = ?`,
    args: [error.slice(0, 500), jobId],
  });
  return { terminal };
}

// Re-queue jobs whose worker died. Called on boot and periodically: a row stuck in
// 'processing' with no heartbeat for `staleSeconds` cannot be running anywhere.
export async function requeueStaleJobs(staleSeconds = 300): Promise<number> {
  const db = getDb();
  const r = await db.execute({
    sql: `UPDATE jobs SET status = 'queued'
          WHERE status = 'processing'
            AND attempts < max_attempts
            AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))
          RETURNING id`,
    args: [`-${Math.max(60, staleSeconds)} seconds`],
  });
  // Out of attempts and abandoned → terminal, so it stops occupying the queue.
  await db.execute({
    sql: `UPDATE jobs SET status = 'failed', error_message = COALESCE(error_message, 'El worker murió sin terminar'),
            completed_at = datetime('now')
          WHERE status = 'processing' AND attempts >= max_attempts
            AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))`,
    args: [`-${Math.max(60, staleSeconds)} seconds`],
  });
  return r.rows.length;
}

export async function countProcessingJobs(): Promise<number> {
  const db = getDb();
  const r = await db.execute({ sql: "SELECT COUNT(*) n FROM jobs WHERE status = 'processing'", args: [] });
  return Number((r.rows[0] as Record<string, unknown>)?.["n"] ?? 0);
}

// What the UI polls: the newest job for a project, owned by this user.
export async function getJobForProject(projectId: string, userId: string): Promise<DbJob | null> {
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT * FROM jobs WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [projectId, userId],
  });
  return r.rows.length ? (r.rows[0] as unknown as DbJob) : null;
}
