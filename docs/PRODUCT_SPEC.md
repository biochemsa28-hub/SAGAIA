# SAGAIA — Product Specification

**Version:** 1.0.0  
**Status:** MVP Planning  
**Last Updated:** 2026-06-08

---

## 1. Vision

SAGAIA is a SaaS platform that transforms a topic or micronicho into a
complete production package for short and long-form narrative video content. No camera,
no crew, no editing experience required.

**Core promise:** From idea to production-ready package in under 5 minutes.

---

## 2. Problem Statement

Content creators, agencies, and solo entrepreneurs need:
- Consistent story ideas at scale
- Professional scripts without hiring writers
- Visual direction without a creative director
- SEO-optimized metadata without an SEO specialist
- All assets organized and ready for tools like CapCut, Premiere, or Canva

Current alternatives require 4–6 hours of manual work per video.

---

## 3. Target Users

| Persona | Description | Volume Goal |
|---|---|---|
| Solo Creator | 1K–500K followers, monetizes YouTube/TikTok | 10–30 videos/week |
| Content Agency | Manages 5–30 client channels | 50–200 videos/week |
| Niche Channel Operator | Passive income via AdSense | 5–20 videos/week |

---

## 4. Core Value Proposition

- **Speed:** Script + scenes + prompts + SEO in < 5 min
- **Quality:** Narrative structure optimized for retention and virality
- **Organized output:** Every asset labeled, numbered, export-ready
- **AI-flexible:** Works with OpenAI today, Claude tomorrow
- **No lock-in:** Exports standard TXT/CSV/JSON you can use anywhere

---

## 5. MVP Feature Set

### Must Have (MVP)
- [ ] User authentication (email + password, local session)
- [ ] Create project with niche/topic/tone/duration
- [ ] Generate full microstory with OpenAI (structured JSON)
- [ ] Scene breakdown with narration text per scene
- [ ] Visual prompts per scene (Midjourney-ready)
- [ ] Animation prompts per scene (Kling/Runway-ready)
- [ ] SEO package (title, description, hashtags, tags)
- [ ] Thumbnail concept + prompt
- [ ] Export: script.txt, prompts.csv, metadata.json, seo.txt
- [ ] API key settings (OpenAI, ElevenLabs)
- [ ] Mock mode when API keys missing
- [ ] Basic activity log
- [ ] JSON schema validation on all AI outputs

### Nice to Have (Post-MVP)
- [ ] ElevenLabs voice generation
- [ ] Character library
- [ ] Scene template library
- [ ] Cloudflare D1/R2 backend
- [ ] Stripe billing
- [ ] Team collaboration

---

## 6. Generation Output Structure

Every project generates the following JSON structure (validated by Zod):

```json
{
  "project_id": "uuid",
  "meta": {
    "title": "string",
    "niche": "string",
    "tone": "string",
    "duration_target": "30s|60s|3-5min|10-20min",
    "language": "string"
  },
  "story": {
    "hook": "string",
    "full_narrative": "string",
    "cta": "string"
  },
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "string",
      "duration_seconds": 5,
      "image_prompt": "string",
      "animation_prompt": "string",
      "emotion": "string",
      "camera_move": "string"
    }
  ],
  "seo": {
    "title": "string",
    "description": "string",
    "hashtags": ["string"],
    "tags": ["string"],
    "thumbnail_concept": "string",
    "thumbnail_prompt": "string"
  },
  "production_notes": {
    "total_duration_seconds": 60,
    "scene_count": 8,
    "voice_style": "string",
    "music_mood": "string"
  }
}
```

---

## 7. Monetization Model

| Plan | Price | Projects/mo | Voice Gen | Priority |
|---|---|---|---|---|
| Free | $0 | 3 | No | Low |
| Starter | $19/mo | 30 | 50 scenes | Normal |
| Pro | $49/mo | 100 | 200 scenes | High |
| Agency | $149/mo | Unlimited | Unlimited | Priority |

---

## 8. Success Metrics (MVP)

- Time to first project generated: < 5 min
- JSON validation pass rate: > 95%
- Export success rate: > 99%
- User returns for second project: > 60% (week 1)
