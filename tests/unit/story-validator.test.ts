import { describe, it, expect } from "vitest";
import {
  validateStoryOutput,
  StoryOutputSchema,
} from "@/lib/validators/story.schema";
import { MOCK_STORY_HORROR, MOCK_STORY_INSPIRACIONAL } from "@/mocks/story.mock";

describe("StoryOutputSchema", () => {
  it("validates the horror mock story", () => {
    const result = StoryOutputSchema.safeParse(MOCK_STORY_HORROR);
    expect(result.success).toBe(true);
  });

  it("validates the inspiracional mock story", () => {
    const result = StoryOutputSchema.safeParse(MOCK_STORY_INSPIRACIONAL);
    expect(result.success).toBe(true);
  });

  it("recorta un hueco de 200+ caracteres en vez de tumbar el guion", () => {
    // Medido en producción 2026-08-26: un hueco largo invalidaba la generación
    // ENTERA ("El proyecto no tiene historia"). El hueco es una nota auxiliar:
    // se recorta al tope y el guion vive.
    const conHuecoLargo = {
      ...MOCK_STORY_HORROR,
      production_notes: {
        ...MOCK_STORY_HORROR.production_notes,
        hueco: "x".repeat(350),
        curva_emocional: "y".repeat(300),
      },
    };
    const result = StoryOutputSchema.safeParse(conHuecoLargo);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.production_notes.hueco?.length).toBe(200);
      expect(result.data.production_notes.curva_emocional?.length).toBe(120);
    }
  });

  it("rejects story with no scenes", () => {
    const invalid = { ...MOCK_STORY_HORROR, scenes: [] };
    const result = StoryOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects story with missing hook", () => {
    const invalid = {
      ...MOCK_STORY_HORROR,
      story: { ...MOCK_STORY_HORROR.story, hook: "" },
    };
    const result = StoryOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("acepta un guion con pocos hashtags — el SEO es auxiliar, no invalida", () => {
    // Antes exigía rechazo con <5 hashtags, pero contradice la regla de la casa:
    // un dato auxiliar (SEO) no puede tumbar una generación que costó créditos.
    const pocosHashtags = {
      ...MOCK_STORY_HORROR,
      seo: { ...MOCK_STORY_HORROR.seo, hashtags: ["#one", "#two"] },
    };
    const result = StoryOutputSchema.safeParse(pocosHashtags);
    expect(result.success).toBe(true);
  });

  it("rejects story with short image prompt", () => {
    const invalidScenes = MOCK_STORY_HORROR.scenes.map((s) => ({
      ...s,
      image_prompt: "short",
    }));
    const invalid = { ...MOCK_STORY_HORROR, scenes: invalidScenes };
    const result = StoryOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("validateStoryOutput", () => {
  it("validates clean JSON string", () => {
    const raw = JSON.stringify(MOCK_STORY_HORROR);
    const result = validateStoryOutput(raw);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("extracts JSON from markdown code block", () => {
    const raw = `\`\`\`json\n${JSON.stringify(MOCK_STORY_HORROR)}\n\`\`\``;
    const result = validateStoryOutput(raw);
    expect(result.success).toBe(true);
  });

  it("repairs trailing commas in JSON", () => {
    const withTrailingComma = `{
      "meta": ${JSON.stringify(MOCK_STORY_HORROR.meta)},
      "story": ${JSON.stringify(MOCK_STORY_HORROR.story)},
      "scenes": ${JSON.stringify(MOCK_STORY_HORROR.scenes)},
      "seo": ${JSON.stringify(MOCK_STORY_HORROR.seo)},
      "production_notes": ${JSON.stringify(MOCK_STORY_HORROR.production_notes)},
    }`;
    const result = validateStoryOutput(withTrailingComma);
    expect(result.success).toBe(true);
  });

  it("returns error for completely invalid JSON", () => {
    const result = validateStoryOutput("this is not json at all {broken");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error with raw field preserved", () => {
    const raw = "not valid json";
    const result = validateStoryOutput(raw);
    expect(result.success).toBe(false);
    expect(result.raw).toBe(raw);
  });
});
