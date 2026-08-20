import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "crypto";
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

// ─── Recuperación de contraseña ───────────────────────────────────────────────
// Se guarda el HASH del token, nunca el token. Quien lea esta tabla no puede
// entrar a ninguna cuenta con lo que ve: para eso necesitaría el valor original,
// que solo existe en el correo del dueño.

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Crea un token de un solo uso. Invalida los anteriores del mismo usuario: pedir
// el enlace dos veces no debe dejar dos llaves vivas.
export async function createPasswordReset(userId: string, minutos = 60): Promise<string> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    args: [userId],
  });
  const token = randomBytes(32).toString("hex");
  await db.execute({
    sql: `INSERT INTO password_resets (token_hash, user_id, expires_at)
          VALUES (?, ?, datetime('now', ?))`,
    args: [hashToken(token), userId, `+${Math.max(5, minutos)} minutes`],
  });
  return token;
}

// Consume el token y cambia la contraseña en un solo paso. Devuelve false si el
// token no existe, ya se usó o venció — sin decir cuál de las tres, porque
// distinguirlas le da información a quien esté probando tokens al azar.
export async function consumePasswordReset(token: string, passwordHash: string): Promise<boolean> {
  const db = getDb();
  // La condición de un solo uso vive en el UPDATE, no en un IF previo: dos
  // pedidos simultáneos con el mismo token no pueden ganar los dos.
  const claim = await db.execute({
    sql: `UPDATE password_resets SET used_at = datetime('now')
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
          RETURNING user_id`,
    args: [hashToken(token)],
  });
  const row = claim.rows[0] as Record<string, unknown> | undefined;
  if (!row) return false;
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    args: [passwordHash, String(row["user_id"])],
  });
  return true;
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
  members: Array<{ name: string; role?: string | null; voice_profile?: string | null; reference_image_url?: string | null; bible_url?: string | null; age?: string | null }>,
): Promise<void> {
  const db = getDb();
  await db.execute({ sql: "DELETE FROM project_cast WHERE project_id = ?", args: [projectId] });

  // ── EL RETRATO SE RE-HOSPEDA, PORQUE LAS URL DE fal EXPIRAN ────────────────
  //
  // Medido: los retratos de un proyecto de hace unos días devuelven 404
  // ("Specified object does not exist") mientras los de ayer siguen vivos. Las
  // imágenes de escena y los clips ya se re-hospedaban a R2; el elenco no, y es
  // justamente el dato que más dura — de él dependen las regeneraciones y la
  // Parte 2 de una serie.
  //
  // Con el retrato muerto, el generador no falla: INVENTA una cara nueva. O sea
  // que el defecto no aparece como un error sino como "el personaje cambió de
  // cara", que es el problema más caro de diagnosticar que tiene esta app.
  //
  // Si R2 no está configurado o la descarga falla, rehostToR2 devuelve la URL
  // original y todo sigue como antes.
  const { rehostToR2 } = await import("@/services/storage");
  const durables = await Promise.all(members.map(async (m) => ({
    ...m,
    reference_image_url: m.reference_image_url
      ? await rehostToR2(m.reference_image_url, "cast", "png", "image/png").catch(() => m.reference_image_url!)
      : m.reference_image_url,
    bible_url: m.bible_url
      ? await rehostToR2(m.bible_url, "cast", "png", "image/png").catch(() => m.bible_url!)
      : m.bible_url,
  })));

  for (const m of durables) {
    if (!m.name) continue;
    await db.execute({
      // bible_url carries over from a previous episode so a series never pays to
      // rebuild the same character sheet twice.
      // age decide si a este personaje se le dibujan picos de contacto o de
      // violencia. Sin guardarla, el generador de picos no puede saber que hay
      // un menor en la escena — y ya se midió lo que pasa: un elenco de adulta y
      // niña recibió los picos de drama, confesión y terror igual.
      sql: `INSERT INTO project_cast (id, project_id, name, role, voice_profile, reference_image_url, bible_url, age)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuidv4(), projectId, m.name, m.role ?? null, m.voice_profile ?? null, m.reference_image_url ?? null, m.bible_url ?? null, m.age ?? null],
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
  // "borrador" = sin modelo de video (el 82,5% del costo). NULL = estreno, para
  // que todo lo creado antes de esta columna siga comportándose igual.
  quality: string | null;
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
  quality?: string | null;
}): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  await db.execute({
    sql: `INSERT INTO projects
      (id, user_id, title, niche, sub_niche, topic, tone, duration_target, language, visual_style, status, ai_provider, animation_tier, credits_spent, reference_image_url, reference_image_urls, series_id, episode_number, parent_project_id, quality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      params.quality ?? null,
    ],
  });
  return id;
}

// ─── MOTION BLUEPRINT ────────────────────────────────────────────────────────
// El plan de movimiento de una escena —qué hace la cámara, con qué emoción se
// actúa, qué se mueve en el ambiente— ya lo escribía la IA y ya se guardaba, pero
// era invisible: el usuario pagaba la animación para recién ahí enterarse de lo
// que el sistema había decidido. Poder verlo y corregirlo ANTES de gastar es la
// diferencia entre dirigir y apostar.
//
// Y es lo que vuelve honesto al borrador: lo que se aprueba acá es exactamente
// lo que el estreno va a animar, porque el generador lee estos mismos campos.
export async function actualizarPlanDeEscena(params: {
  projectId: string;
  userId: string;
  sceneNumber: number;
  camera_move?: string;
  emotion?: string;
  environment?: string;
}): Promise<boolean> {
  const db = getDb();
  const dueño = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [params.projectId, params.userId],
  });
  if (!dueño.rows[0]) return false;

  const campos: string[] = [];
  const args: unknown[] = [];
  for (const k of ["camera_move", "emotion", "environment"] as const) {
    const v = params[k];
    if (typeof v === "string") { campos.push(`${k} = ?`); args.push(v.slice(0, 200)); }
  }
  if (!campos.length) return false;
  args.push(params.projectId, params.sceneNumber);

  const r = await db.execute({
    sql: `UPDATE scenes SET ${campos.join(", ")} WHERE project_id = ? AND scene_number = ?`,
    args: args as never[],
  });
  return (r.rowsAffected ?? 0) > 0;
}

// ─── MOTION DNA ──────────────────────────────────────────────────────────────
// El movimiento como cosa reutilizable, no como algo atrapado dentro de un video.
// Lo que se guarda es la MISMA metadata que el generador ya sabe leer —cámara,
// emoción, ambiente— así que aplicar un DNA a otra escena es escribir esos tres
// campos y nada más. Ahí está la gracia: no hace falta un modelo nuevo.

export interface MotionDna {
  id: string;
  name: string;
  camera_move: string | null;
  emotion: string | null;
  environment: string | null;
  niche: string | null;
  origin_project_id: string | null;
  used_count: number;
  created_at: string;
}

// Captura el plan de una escena que salió bien y lo guarda con nombre.
export async function guardarMotionDna(params: {
  userId: string;
  projectId: string;
  sceneNumber: number;
  name: string;
}): Promise<MotionDna | null> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT s.camera_move, s.emotion, s.environment, p.niche
          FROM scenes s JOIN projects p ON p.id = s.project_id
          WHERE s.project_id = ? AND s.scene_number = ? AND p.user_id = ?`,
    args: [params.projectId, params.sceneNumber, params.userId],
  });
  const f = r.rows[0] as Record<string, unknown> | undefined;
  if (!f) return null;
  // Un DNA sin cámara ni emoción no describe ningún movimiento: guardarlo sería
  // ofrecer después una plantilla vacía.
  if (!f["camera_move"] && !f["emotion"]) return null;

  const texto = (k: string): string | null => {
    const v = f[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  const id = uuidv4();
  const nombre = params.name.slice(0, 60);
  await db.execute({
    sql: `INSERT INTO motion_dna (id, user_id, name, camera_move, emotion, environment, niche, origin_project_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, params.userId, nombre, texto("camera_move"), texto("emotion"),
           texto("environment"), texto("niche"), params.projectId],
  });
  return {
    id, name: nombre,
    camera_move: texto("camera_move"),
    emotion: texto("emotion"),
    environment: texto("environment"),
    niche: texto("niche"),
    origin_project_id: params.projectId, used_count: 0, created_at: new Date().toISOString(),
  };
}

export async function listarMotionDna(userId: string): Promise<MotionDna[]> {
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT * FROM motion_dna WHERE user_id = ? ORDER BY used_count DESC, created_at DESC LIMIT 60",
    args: [userId],
  });
  return r.rows as unknown as MotionDna[];
}

// Aplica un DNA a una escena. Escribe los mismos campos que el generador lee, así
// que la próxima animación de esa escena sale con ese movimiento.
export async function aplicarMotionDna(params: {
  userId: string;
  dnaId: string;
  projectId: string;
  sceneNumbers: number[];
}): Promise<number> {
  const db = getDb();
  const d = await db.execute({
    sql: "SELECT camera_move, emotion, environment FROM motion_dna WHERE id = ? AND user_id = ?",
    args: [params.dnaId, params.userId],
  });
  const dna = d.rows[0] as Record<string, unknown> | undefined;
  if (!dna) return 0;

  const dueño = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [params.projectId, params.userId],
  });
  if (!dueño.rows[0]) return 0;

  const val = (k: string): string | null => {
    const v = dna[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  let tocadas = 0;
  for (const n of params.sceneNumbers.slice(0, 40)) {
    const r = await db.execute({
      // El ambiente solo se pisa si el DNA trae uno: un DNA de cámara no tiene
      // por qué borrar la lluvia que la escena ya tenía.
      sql: `UPDATE scenes SET camera_move = ?, emotion = ?, environment = COALESCE(?, environment)
            WHERE project_id = ? AND scene_number = ?`,
      args: [val("camera_move"), val("emotion"), val("environment"), params.projectId, n],
    });
    tocadas += r.rowsAffected ?? 0;
  }
  if (tocadas) {
    await db.execute({ sql: "UPDATE motion_dna SET used_count = used_count + 1 WHERE id = ?", args: [params.dnaId] });
  }
  return tocadas;
}

export async function borrarMotionDna(userId: string, dnaId: string): Promise<boolean> {
  const r = await getDb().execute({
    sql: "DELETE FROM motion_dna WHERE id = ? AND user_id = ?",
    args: [dnaId, userId],
  });
  return (r.rowsAffected ?? 0) > 0;
}

// Asciende un borrador a estreno. Solo cambia la marca: el guion, el elenco, las
// imágenes y las escenas aprobadas ya existen y no se vuelven a pagar — lo único
// que falta comprar es la animación.
// `cobradoAhora` se SUMA a credits_spent: si después el proyecto se reembolsa,
// se devuelve borrador + diferencia — el total real — y no solo el borrador.
export async function ascenderAEstreno(projectId: string, userId: string, cobradoAhora = 0): Promise<boolean> {
  const db = getDb();
  const r = await db.execute({
    sql: "UPDATE projects SET quality = NULL, credits_spent = credits_spent + ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND quality IS NOT NULL",
    args: [Math.max(0, Math.round(cobradoAhora)), projectId, userId],
  });
  return (r.rowsAffected ?? 0) > 0;
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

// ── Genoma: captura el ADN creativo del proyecto (upsert, no falla nunca) ──
export async function upsertGenome(params: {
  projectId: string; userId: string;
  premisa?: string | null; formato?: string | null; nicho?: string | null;
  tono?: string | null; estilo?: string | null; duracion?: string | null;
  arquetipo?: string | null; scorePremisa?: number | null;
  mecanicas?: string[] | null; hook?: string | null; cta?: string | null;
  escenas?: number | null;
}): Promise<void> {
  const db = getDb();
  try {
    await db.execute({
      sql: `INSERT INTO video_genome (project_id, user_id, premisa, formato, nicho, tono, estilo, duracion, arquetipo, score_premisa, mecanicas, hook, cta, escenas, actualizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(project_id) DO UPDATE SET
              premisa=COALESCE(excluded.premisa, premisa), formato=COALESCE(excluded.formato, formato),
              nicho=COALESCE(excluded.nicho, nicho), tono=COALESCE(excluded.tono, tono),
              estilo=COALESCE(excluded.estilo, estilo), duracion=COALESCE(excluded.duracion, duracion),
              arquetipo=COALESCE(excluded.arquetipo, arquetipo), score_premisa=COALESCE(excluded.score_premisa, score_premisa),
              mecanicas=COALESCE(excluded.mecanicas, mecanicas), hook=COALESCE(excluded.hook, hook),
              cta=COALESCE(excluded.cta, cta), escenas=COALESCE(excluded.escenas, escenas), actualizado=datetime('now')`,
      args: [params.projectId, params.userId, params.premisa ?? null, params.formato ?? null, params.nicho ?? null,
        params.tono ?? null, params.estilo ?? null, params.duracion ?? null, params.arquetipo ?? null,
        params.scorePremisa ?? null, params.mecanicas ? JSON.stringify(params.mecanicas) : null,
        params.hook ?? null, params.cta ?? null, params.escenas ?? null],
    });
  } catch (e) { console.warn("[genoma] no se pudo guardar:", e instanceof Error ? e.message.slice(0, 120) : e); }
}

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
        (id, project_id, story_id, scene_number, narration_text, duration_seconds, image_prompt, animation_prompt, emotion, camera_move, speaker, voice_profile, sfx_prompt, speaker_look, location, environment, physical_action, is_peak, ambience)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        scene.physical_action || null,
        (scene as { is_peak?: boolean }).is_peak ? 1 : 0,
        (scene as { ambience?: string | null }).ambience || null,
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
  ambience?: string | null;     // qué se OYE todo el tiempo (regadera, tele, cubiertos)
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

// Marca (o desmarca) una escena como APROBADA. Una escena aprobada no se puede
// regenerar: es la escena que el usuario ya dio por buena, y perderla por un
// click de más en una miniatura de 100px es exactamente el accidente que hace
// que la gente deje de tocar los controles.
//
// El candado se guarda en metadata del asset — misma columna que el historial,
// sin migración — y se hace cumplir del lado del servidor en /api/images. Un
// candado que solo apaga un botón no es un candado.
export async function setSceneLock(params: {
  projectId: string;
  userId: string;
  sceneNumber: number;
  locked: boolean;
}): Promise<boolean> {
  const db = getDb();
  const dueño = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [params.projectId, params.userId],
  });
  if (!dueño.rows[0]) return false;

  const res = await db.execute({
    sql: `SELECT a.id, a.metadata FROM assets a
          JOIN scenes s ON s.id = a.scene_id
          WHERE a.project_id = ? AND s.scene_number = ? AND a.asset_type = 'image'`,
    args: [params.projectId, params.sceneNumber],
  });
  const fila = res.rows[0] as Record<string, unknown> | undefined;
  if (!fila) return false;

  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(String(fila["metadata"] ?? "{}")) as Record<string, unknown>; } catch { meta = {}; }
  meta["aprobada"] = params.locked;
  await db.execute({
    sql: "UPDATE assets SET metadata = ?, updated_at = datetime('now') WHERE id = ?",
    args: [JSON.stringify(meta), fila["id"] as string],
  });
  return true;
}

// Números de escena aprobados en este proyecto. Lo consulta /api/images antes
// de gastar un centavo en regenerar.
export async function getLockedScenes(projectId: string): Promise<Set<number>> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT s.scene_number, a.metadata FROM assets a
          JOIN scenes s ON s.id = a.scene_id
          WHERE a.project_id = ? AND a.asset_type = 'image'`,
    args: [projectId],
  });
  const bloqueadas = new Set<number>();
  for (const r of res.rows as unknown as Array<Record<string, unknown>>) {
    try {
      const m = JSON.parse(String(r["metadata"] ?? "{}")) as { aprobada?: boolean };
      if (m.aprobada) bloqueadas.add(Number(r["scene_number"]));
    } catch { /* metadata ilegible = sin candado */ }
  }
  return bloqueadas;
}

// Vuelve una escena a una versión anterior de su imagen. Es gratis — la imagen
// ya está generada y pagada — y por eso deshacer una regeneración fallida no
// puede costar lo mismo que hacerla. El swap es simétrico: la que estaba pasa
// al historial, así se puede ir y volver sin perder ninguna de las dos.
export async function revertAssetVersion(params: {
  projectId: string;
  userId: string;
  sceneNumber: number;
  assetType: string;
  targetUrl: string;
}): Promise<boolean> {
  const db = getDb();
  const dueño = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [params.projectId, params.userId],
  });
  if (!dueño.rows[0]) return false;

  const res = await db.execute({
    sql: `SELECT a.id, a.public_url, a.metadata FROM assets a
          JOIN scenes s ON s.id = a.scene_id
          WHERE a.project_id = ? AND s.scene_number = ? AND a.asset_type = ?`,
    args: [params.projectId, params.sceneNumber, params.assetType],
  });
  const fila = res.rows[0] as Record<string, unknown> | undefined;
  if (!fila) return false;

  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(String(fila["metadata"] ?? "{}")) as Record<string, unknown>; } catch { meta = {}; }
  const versiones = Array.isArray(meta["versiones"]) ? (meta["versiones"] as string[]) : [];
  // Solo se puede volver a una versión que este asset tuvo de verdad: sin esto,
  // el endpoint aceptaría cualquier URL que alguien quisiera inyectar.
  if (!versiones.includes(params.targetUrl)) return false;

  const actual = fila["public_url"] as string | null;
  const nuevas = versiones.filter(v => v !== params.targetUrl);
  if (actual && actual !== params.targetUrl) nuevas.push(actual);
  meta["versiones"] = nuevas.slice(-5);

  await db.execute({
    sql: "UPDATE assets SET public_url = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?",
    args: [params.targetUrl, JSON.stringify(meta), fila["id"] as string],
  });
  return true;
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
    const fila = existing.rows[0] as Record<string, unknown>;
    const assetId = fila["id"] as string;
    // REGENERAR NO DESTRUYE. Antes este UPDATE pisaba public_url y la versión
    // anterior desaparecía: si la nueva imagen salía peor, no había vuelta y el
    // usuario había pagado dos veces por quedarse con la mala. Ahora la URL que
    // se reemplaza se apila en metadata.versiones y se puede volver a ella
    // gratis. Va en metadata (columna que ya existe) a propósito: guardar
    // historial no justifica una tabla nueva ni una migración.
    const previa = fila["public_url"] as string | null;
    let meta: Record<string, unknown> = {};
    try { meta = params.metadata ? JSON.parse(params.metadata) as Record<string, unknown> : {}; } catch { meta = {}; }
    if (!params.metadata) {
      const actual = await db.execute({ sql: "SELECT metadata FROM assets WHERE id = ?", args: [assetId] });
      try { meta = JSON.parse(String((actual.rows[0] as Record<string, unknown>)?.["metadata"] ?? "{}")) as Record<string, unknown>; } catch { meta = {}; }
    }
    const versiones = Array.isArray(meta["versiones"]) ? (meta["versiones"] as string[]) : [];
    if (previa && previa !== params.publicUrl && !versiones.includes(previa)) {
      versiones.push(previa);
      // Tope de 5: el historial es para deshacer un error reciente, no un archivo.
      meta["versiones"] = versiones.slice(-5);
    }
    await db.execute({
      sql: "UPDATE assets SET public_url = ?, file_path = ?, status = 'done', metadata = ?, updated_at = datetime('now') WHERE id = ?",
      args: [params.publicUrl, params.filePath ?? null, JSON.stringify(meta), assetId],
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
// SE MIRAN VARIOS CANDIDATOS, NO SOLO EL PRIMERO.
//
// El reclamo siempre fue atómico —el UPDATE con "AND status='queued'" hace que
// solo un worker gane— pero antes todos miraban EXACTAMENTE el mismo trabajo: el
// más viejo. Con una sola réplica daba igual. Con cinco, las cinco eligen el
// mismo, gana una, y las otras cuatro se duermen hasta el siguiente sondeo: la
// flota entera reclama un trabajo cada JOB_POLL_MS, exactamente igual que una
// máquina sola. Se pagarían cinco réplicas para rendir como una.
//
// Ahora cada worker toma una ventana de los más viejos y los prueba en orden
// hasta ganar uno. Dos workers rara vez chocan, y cuando chocan el perdedor pasa
// al siguiente candidato en el mismo ciclo en vez de irse a dormir.
const CLAIM_WINDOW = 8;

export async function claimNextJob(): Promise<DbJob | null> {
  const db = getDb();
  const next = await db.execute({
    sql: "SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?",
    args: [CLAIM_WINDOW],
  });
  if (!next.rows.length) return null;

  // El desorden es a propósito: si todas las réplicas recorrieran la ventana en
  // el mismo orden, volverían a pelearse por el primero.
  const ids = next.rows
    .map((r) => (r as Record<string, unknown>)["id"] as string | undefined)
    .filter((id): id is string => Boolean(id));
  const inicio = Math.floor(Math.random() * ids.length);

  for (let k = 0; k < ids.length; k++) {
    const id = ids[(inicio + k) % ids.length]!;
    const claimed = await db.execute({
      sql: `UPDATE jobs SET status = 'processing', attempts = attempts + 1,
              started_at = COALESCE(started_at, datetime('now')), heartbeat_at = datetime('now')
            WHERE id = ? AND status = 'queued' RETURNING *`,
      args: [id],
    });
    if (claimed.rows.length) return claimed.rows[0] as unknown as DbJob;
    // Otro worker se lo llevó entre el SELECT y el UPDATE. Siguiente candidato.
  }
  return null;
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
