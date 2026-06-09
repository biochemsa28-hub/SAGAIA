import { describe, it, expect } from "vitest";
import { MockAIAdapter } from "@/lib/ai/adapter";
import { StoryOutputSchema } from "@/lib/validators/story.schema";
import type { StoryInput } from "@/lib/validators/story.schema";

const BASE_INPUT: StoryInput = {
  niche: "terror",
  topic: "La casa que nadie quiso comprar",
  tone: "horror",
  duration_target: "60s",
  language: "es",
  visual_style: "cinematic",
  target_platform: "youtube_shorts",
};

describe("MockAIAdapter", () => {
  const adapter = new MockAIAdapter();

  it("always returns success", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.success).toBe(true);
  });

  it("returns valid StoryOutput structure", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.data).toBeDefined();
    const validation = StoryOutputSchema.safeParse(result.data);
    expect(validation.success).toBe(true);
  });

  it("returns correct scene count for 30s duration", async () => {
    const result = await adapter.generateStory(
      { ...BASE_INPUT, duration_target: "30s" },
      "",
      ""
    );
    expect(result.data?.scenes.length).toBe(4);
    expect(result.data?.production_notes.total_duration_seconds).toBe(30);
  });

  it("returns correct scene count for 60s duration", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.data?.scenes.length).toBe(6);
    expect(result.data?.production_notes.total_duration_seconds).toBe(60);
  });

  it("returns correct scene count for 3-5min duration", async () => {
    const result = await adapter.generateStory(
      { ...BASE_INPUT, duration_target: "3-5min" },
      "",
      ""
    );
    expect(result.data?.scenes.length).toBe(10);
    expect(result.data?.production_notes.total_duration_seconds).toBe(240);
  });

  it("reflects input niche in meta", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.data?.meta.niche).toBe("terror");
    expect(result.data?.meta.tone).toBe("horror");
  });

  it("returns provider as mock", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.provider).toBe("mock");
  });

  it("returns zero tokens and zero cost", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    expect(result.tokensUsed).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it("all scenes have required fields", async () => {
    const result = await adapter.generateStory(BASE_INPUT, "", "");
    for (const scene of result.data!.scenes) {
      expect(scene.narration_text.length).toBeGreaterThan(0);
      expect(scene.image_prompt.length).toBeGreaterThan(10);
      expect(scene.animation_prompt.length).toBeGreaterThan(0);
      expect(scene.scene_number).toBeGreaterThan(0);
    }
  });
});
