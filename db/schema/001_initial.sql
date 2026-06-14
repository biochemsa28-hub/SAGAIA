-- ============================================================
-- VYNAVO — Initial Database Schema
-- Compatible with: SQLite (Phase 1) + Cloudflare D1 (Phase 2)
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  password_hash TEXT,
  plan        TEXT NOT NULL DEFAULT 'free',  -- free|starter|pro|agency
  credits     INTEGER NOT NULL DEFAULT 5,
  openai_key_enc  TEXT,    -- encrypted per-user key (Phase 2)
  eleven_key_enc  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  niche       TEXT NOT NULL,
  sub_niche   TEXT,
  topic       TEXT NOT NULL,
  tone        TEXT NOT NULL,   -- horror|romance|mystery|inspirational|comedy|thriller|documentary
  duration_target TEXT NOT NULL, -- 30s|60s|3-5min|10-20min
  language    TEXT NOT NULL DEFAULT 'es',
  visual_style TEXT NOT NULL DEFAULT 'cinematic', -- cinematic|anime|realistic|cartoon|vintage
  status      TEXT NOT NULL DEFAULT 'draft',
  ai_provider TEXT NOT NULL DEFAULT 'openai', -- openai|claude|mock
  generation_model TEXT,
  error_message TEXT,
  has_voice   INTEGER NOT NULL DEFAULT 0,
  has_images  INTEGER NOT NULL DEFAULT 0,
  has_clips   INTEGER NOT NULL DEFAULT 0,
  has_final   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Status: draft|generating|script_generated|prompts_generated|
--         voice_pending|voice_done|images_pending|images_done|
--         animation_pending|animation_done|ready|failed

-- Stories (generated narrative)
CREATE TABLE IF NOT EXISTS stories (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  hook            TEXT NOT NULL,
  full_narrative  TEXT NOT NULL,
  cta             TEXT NOT NULL,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  scene_count     INTEGER NOT NULL DEFAULT 0,
  voice_style     TEXT,
  music_mood      TEXT,
  raw_ai_response TEXT,  -- full JSON from AI for debugging
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scenes
CREATE TABLE IF NOT EXISTS scenes (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  story_id         TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_number     INTEGER NOT NULL,
  narration_text   TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 5,
  image_prompt     TEXT,
  animation_prompt TEXT,
  emotion          TEXT,
  camera_move      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(story_id, scene_number)
);

-- SEO Package
CREATE TABLE IF NOT EXISTS seo_packages (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  hashtags            TEXT NOT NULL,  -- JSON array
  tags                TEXT NOT NULL,  -- JSON array
  thumbnail_concept   TEXT,
  thumbnail_prompt    TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Assets (audio, images, videos)
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id    TEXT REFERENCES scenes(id),
  asset_type  TEXT NOT NULL,  -- audio|image|video|thumbnail|zip
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|processing|done|error
  file_path   TEXT,   -- local path (Phase 1)
  r2_key      TEXT,   -- R2 object key (Phase 2)
  public_url  TEXT,
  file_size_bytes INTEGER,
  mime_type   TEXT,
  metadata    TEXT,   -- JSON: duration, resolution, etc.
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Characters (library)
CREATE TABLE IF NOT EXISTS characters (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  archetype   TEXT,   -- hero|villain|mentor|sidekick|antagonist
  visual_prompt TEXT,
  voice_style TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jobs (async processing)
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id),
  user_id     TEXT REFERENCES users(id),
  job_type    TEXT NOT NULL, -- generate_story|generate_voice|generate_image|export
  status      TEXT NOT NULL DEFAULT 'queued', -- queued|processing|done|failed
  payload     TEXT NOT NULL DEFAULT '{}',  -- JSON input
  result      TEXT,   -- JSON output
  error_message TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  started_at  TEXT,
  completed_at TEXT
);

-- API Logs
CREATE TABLE IF NOT EXISTS api_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  project_id  TEXT REFERENCES projects(id),
  provider    TEXT NOT NULL,  -- openai|claude|elevenlabs|mock
  endpoint    TEXT NOT NULL,
  model       TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_usd    REAL DEFAULT 0,
  duration_ms INTEGER,
  status_code INTEGER,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_story ON scenes(story_id);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_api_logs_user ON api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_project ON api_logs(project_id);
