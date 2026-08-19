const { buildUserPrompt } = await import("../lib/ai/prompts.ts");
const p = buildUserPrompt({ niche: "chisme", topic: "x", tone: "comedy", duration_target: "30s", language: "es", visual_style: "realistic", format: "escena" });
console.log("recordatorio final en:", p.lastIndexOf("RECORDATORIO FINAL"), "de", p.length);
