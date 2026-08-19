const { buildUserPrompt } = await import("../lib/ai/prompts.ts");
const p = buildUserPrompt({ niche: "chisme", topic: "tres mujeres bailando reggaeton en una azotea", tone: "comedy", duration_target: "30s", language: "es", visual_style: "realistic", format: "escena" });
console.log("contiene bloque escena:", p.includes("FORMATO: ESCENA"));
console.log("posición:", p.indexOf("FORMATO: ESCENA"), "de", p.length);
