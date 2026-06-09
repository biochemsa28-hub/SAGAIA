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

  it("rejects story with fewer than 5 SEO hashtags", () => {
    const invalid = {
      ...MOCK_STORY_HORROR,
      seo: { ...MOCK_STORY_HORROR.seo, hashtags: ["#one", "#two"] },
    };
    const result = StoryOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
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
