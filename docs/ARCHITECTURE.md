# VYNAVO — Technical Architecture

**Version:** 1.0.0

---

## Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│                  BROWSER (Client)                        │
│         Next.js 14 App Router + TailwindCSS             │
│         shadcn/ui components + Zustand state            │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────▼─────────┐
         │  Next.js API     │  ← Phase 1: local API routes
         │  Routes (/api/*) │  ← Phase 2: migrate to CF Workers
         └────────┬─────────┘
                  │
    ┌─────────────┼──────────────┐
    │             │              │
┌───▼───┐   ┌────▼────┐   ┌────▼────┐
│OpenAI │   │Eleven   │   │Local FS │
│  API  │   │Labs API │   │/ SQLite │
└───────┘   └─────────┘   └─────────┘

Phase 2: Cloudflare Migration
┌─────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE                            │
│  Workers (Hono) │ D1 (SQLite) │ R2 │ Queues │ Workflows│
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1 Architecture (Local / Hostinger-ready)

### Data Flow: Story Generation

```
User fills form
→ POST /api/generate/story
→ StoryGeneratorService.generate(input)
  → validate input (Zod)
  → build system prompt + user prompt
  → call OpenAI (or mock if no key)
  → parse JSON response
  → validate output (Zod schema)
  → if invalid → attempt repair → retry once
  → if still invalid → return error + log
  → save to SQLite / in-memory store
  → return structured response
→ UI renders SceneEditor
```

### AI Adapter Pattern

```typescript
interface AIAdapter {
  generateStory(input: StoryInput): Promise<StoryOutput>
  generatePrompts(scenes: Scene[]): Promise<PromptsOutput>
}

// Implementations:
class OpenAIAdapter implements AIAdapter { ... }
class ClaudeAdapter implements AIAdapter { ... }  // future
class MockAdapter implements AIAdapter { ... }     // always available
```

### File Structure

```
VYNAVO-studio/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (no sidebar)
│   ├── (dashboard)/              # App pages (with sidebar)
│   └── api/                      # API routes (Phase 1 backend)
├── components/                   # React components
│   ├── ui/                       # Primitive UI (shadcn-style)
│   ├── dashboard/                # Dashboard-specific
│   ├── project/                  # Project wizard
│   ├── editor/                   # Script editor
│   ├── export/                   # Export UI
│   └── shared/                   # Reusable components
├── lib/                          # Core utilities
│   ├── ai/                       # AI adapter + prompt builders
│   ├── validators/               # Zod schemas
│   ├── utils/                    # Helpers
│   └── constants/                # Nichos, tones, etc.
├── services/                     # Business logic
│   ├── openai/                   # OpenAI integration
│   ├── elevenlabs/               # ElevenLabs integration
│   ├── storage/                  # File storage abstraction
│   └── export/                   # ZIP/TXT/CSV/JSON export
├── db/                           # Database layer
│   ├── schema/                   # Table definitions
│   ├── migrations/               # SQL migration files
│   └── seeds/                    # Dev data
├── workers/                      # Cloudflare Workers (Phase 2)
├── workflows/                    # Cloudflare Workflows (Phase 2)
├── skills/                       # AI skill definitions
├── mocks/                        # Mock implementations
├── tests/                        # Test suites
└── docs/                         # Documentation
```

---

## Database Schema (Phase 1: SQLite via better-sqlite3)

### Tables
- `users` — auth and plan info
- `projects` — top-level project container
- `stories` — generated narrative content
- `scenes` — individual scene breakdowns
- `assets` — files (audio, images) in R2 or local
- `jobs` — async processing queue
- `api_logs` — AI call logs for debugging

### Project State Machine

```
draft → generating → script_generated → prompts_generated
     → voice_pending → voice_done
     → images_pending → images_done
     → animation_pending → animation_done
     → ready
     → failed (at any step)
```

---

## API Adapter Decision Tree

```
Request to generate story
├── OPENAI_API_KEY present? → use OpenAIAdapter
├── ANTHROPIC_API_KEY present? → use ClaudeAdapter (future)
└── Neither → use MockAdapter (returns realistic fake data)

Request to generate voice
├── ELEVENLABS_API_KEY present? → use ElevenLabsAdapter
└── Missing → use MockAdapter (returns silent audio or TTS)
```

---

## Phase 2: Cloudflare Migration Plan

| Phase 1 (Local) | Phase 2 (Cloudflare) |
|---|---|
| Next.js API routes | Cloudflare Workers (Hono) |
| SQLite (better-sqlite3) | Cloudflare D1 |
| Local filesystem | Cloudflare R2 |
| In-process async | Cloudflare Queues |
| — | Cloudflare Workflows |
| — | Durable Objects (realtime) |

Migration is straightforward because the service layer is abstracted
from the transport layer via repository interfaces.

---

## Security Considerations

- API keys stored in `.env.local` (never committed)
- API keys settable per-user in settings (encrypted at rest in Phase 2)
- Input sanitized with Zod before hitting any AI endpoint
- AI output validated with Zod before saving to DB
- Rate limiting on all `/api/generate/*` routes
- Content moderation: monetization-safety-checker skill runs on every output
