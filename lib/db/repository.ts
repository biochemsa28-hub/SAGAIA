import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { StoryOutput } from "@/lib/validators/story.schema";

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
    sql: "INSERT INTO users (id, email, name, password_hash, plan, credits) VALUES (?, ?, ?, ?, 'free', 5)",
    args: [id, params.email, params.name, params.passwordHash],
  });
  return {
    id,
    email: params.email,
    name: params.name,
    password_hash: params.passwordHash,
    plan: "free",
    credits: 5,
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
}): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO projects
      (id, user_id, title, niche, sub_niche, topic, tone, duration_target, language, visual_style, status, ai_provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    args: [
      id, params.userId, params.title, params.niche,
      params.subNiche ?? null, params.topic, params.tone,
      params.durationTarget, params.language, params.visualStyle,
      params.aiProvider,
    ],
  });
  return id;
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
        (id, project_id, story_id, scene_number, narration_text, duration_seconds, image_prompt, animation_prompt, emotion, camera_move)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuidv4(), projectId, storyId, scene.scene_number,
        scene.narration_text, scene.duration_seconds,
        scene.image_prompt ?? null, scene.animation_prompt ?? null,
        scene.emotion ?? null, scene.camera_move ?? null,
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
      sql: "UPDATE assets SET public_url = ?, file_path = ?, status = 'done', updated_at = datetime('now') WHERE id = ?",
      args: [params.publicUrl, params.filePath ?? null, assetId],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO assets (id, project_id, scene_id, asset_type, status, public_url, file_path, mime_type)
            VALUES (?, ?, ?, ?, 'done', ?, ?, ?)`,
      args: [uuidv4(), params.projectId, sceneId, params.assetType,
             params.publicUrl, params.filePath ?? null, params.mimeType ?? null],
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
