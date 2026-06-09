import archiver from "archiver";
import { PassThrough } from "stream";
import { existsSync, createReadStream } from "fs";
import { join, isAbsolute, resolve } from "path";
import type { StoryOutput } from "@/lib/validators/story.schema";

function getAudioPath(projectId: string, sceneNumber: number): string | null {
  const raw = process.env.VERCEL ? "/tmp/storage" : (process.env.STORAGE_PATH ?? "./storage");
  const storageDir = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  const p = join(storageDir, "audio", projectId, `scene_${sceneNumber}.mp3`);
  return existsSync(p) ? p : null;
}

export async function buildProjectZip(story: StoryOutput, projectId?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(passThrough);

    const projectName = slugify(story.meta.title);

    // 1. script.txt — full narrative
    const script = buildScript(story);
    archive.append(script, { name: `${projectName}/script.txt` });

    // 2. prompts.csv — all scene prompts
    const csv = buildPromptsCsv(story);
    archive.append(csv, { name: `${projectName}/prompts.csv` });

    // 3. seo.txt — SEO package
    const seo = buildSeoTxt(story);
    archive.append(seo, { name: `${projectName}/seo.txt` });

    // 4. metadata.json — full structured data
    const meta = JSON.stringify(story, null, 2);
    archive.append(meta, { name: `${projectName}/metadata.json` });

    // 5. scenes/ — individual scene files + audio if generated
    let hasAudio = false;
    for (const scene of story.scenes) {
      const sceneFile = buildSceneTxt(scene);
      const num = String(scene.scene_number).padStart(2, "0");
      archive.append(sceneFile, { name: `${projectName}/scenes/scene_${num}.txt` });

      if (projectId) {
        const audioPath = getAudioPath(projectId, scene.scene_number);
        if (audioPath) {
          archive.append(createReadStream(audioPath), { name: `${projectName}/audio/scene_${num}.mp3` });
          hasAudio = true;
        }
      }
    }

    // 6. README inside ZIP
    void hasAudio; // used for potential future README mention
    const readme = buildReadme(story, projectName);
    archive.append(readme, { name: `${projectName}/README.txt` });

    archive.finalize();
  });
}

// ── Builders ──────────────────────────────────────────────────────────────────

function buildScript(s: StoryOutput): string {
  const lines: string[] = [
    `TÍTULO: ${s.meta.title}`,
    `NICHO: ${s.meta.niche} | TONO: ${s.meta.tone} | DURACIÓN: ${s.meta.duration_target}`,
    `IDIOMA: ${s.meta.language} | ESTILO: ${s.meta.visual_style}`,
    "",
    "═".repeat(60),
    "GANCHO DE APERTURA",
    "═".repeat(60),
    s.story.hook,
    "",
    "═".repeat(60),
    "NARRATIVA COMPLETA",
    "═".repeat(60),
    s.story.full_narrative,
    "",
    "═".repeat(60),
    "CALL TO ACTION",
    "═".repeat(60),
    s.story.cta,
    "",
    "═".repeat(60),
    "ESCENAS DETALLADAS",
    "═".repeat(60),
    "",
  ];

  for (const scene of s.scenes) {
    const num = String(scene.scene_number).padStart(2, "0");
    lines.push(`[ESCENA ${num}] — ${scene.duration_seconds}s | Emoción: ${scene.emotion} | Cámara: ${scene.camera_move}`);
    lines.push(`NARRACIÓN: ${scene.narration_text}`);
    lines.push("");
  }

  lines.push("═".repeat(60));
  lines.push("NOTAS DE PRODUCCIÓN");
  lines.push("═".repeat(60));
  lines.push(`Duración total: ${s.production_notes.total_duration_seconds}s`);
  lines.push(`Estilo de voz: ${s.production_notes.voice_style}`);
  lines.push(`Mood de música: ${s.production_notes.music_mood}`);

  return lines.join("\n");
}

function buildPromptsCsv(s: StoryOutput): string {
  const header = "scene_number,duration_seconds,emotion,camera_move,image_prompt,animation_prompt";
  const rows = s.scenes.map((sc) =>
    [
      sc.scene_number,
      sc.duration_seconds,
      csvCell(sc.emotion),
      csvCell(sc.camera_move),
      csvCell(sc.image_prompt),
      csvCell(sc.animation_prompt),
    ].join(",")
  );
  const footer = [
    "",
    "# THUMBNAIL",
    `thumbnail_concept,${csvCell(s.seo.thumbnail_concept)}`,
    `thumbnail_prompt,${csvCell(s.seo.thumbnail_prompt)}`,
  ];
  return [header, ...rows, ...footer].join("\n");
}

function buildSeoTxt(s: StoryOutput): string {
  return [
    `TÍTULO SEO: ${s.seo.title}`,
    "",
    "DESCRIPCIÓN:",
    s.seo.description,
    "",
    "HASHTAGS:",
    s.seo.hashtags.join(" "),
    "",
    "TAGS (keywords):",
    s.seo.tags.join(", "),
    "",
    "CONCEPTO MINIATURA:",
    s.seo.thumbnail_concept,
    "",
    "PROMPT MINIATURA (para generador de imágenes):",
    s.seo.thumbnail_prompt,
  ].join("\n");
}

function buildSceneTxt(scene: StoryOutput["scenes"][number]): string {
  return [
    `ESCENA ${scene.scene_number}`,
    `Duración: ${scene.duration_seconds}s | Emoción: ${scene.emotion} | Cámara: ${scene.camera_move}`,
    "",
    "NARRACIÓN (para voz en off):",
    scene.narration_text,
    "",
    "PROMPT DE IMAGEN (Midjourney / SDXL):",
    scene.image_prompt,
    "",
    "PROMPT DE ANIMACIÓN (Kling / Runway):",
    scene.animation_prompt,
  ].join("\n");
}

function buildReadme(s: StoryOutput, projectName: string): string {
  return [
    `MICRODRAMA STUDIO AI — Paquete de producción`,
    `Proyecto: ${projectName}`,
    `Generado: ${new Date().toISOString()}`,
    "",
    "CONTENIDO DE ESTE ZIP:",
    "  script.txt       — Guion completo con todas las escenas",
    "  prompts.csv      — Todos los prompts de imagen y animación en CSV",
    "  seo.txt          — Paquete SEO: título, descripción, hashtags, tags",
    "  metadata.json    — Datos completos del proyecto en JSON",
    "  scenes/          — Archivos individuales por escena",
    "",
    "CÓMO USAR:",
    "  1. Copia los prompts de imagen → pégalos en Midjourney o SDXL",
    "  2. Con las imágenes generadas → usa los prompts de animación en Kling o Runway",
    "  3. Usa el script.txt para grabar o generar voz en off (ElevenLabs)",
    "  4. Copia el seo.txt al publicar en YouTube/TikTok/Instagram",
    "",
    `Duración total: ${s.production_notes.total_duration_seconds}s`,
    `Escenas: ${s.production_notes.scene_count}`,
    `Estilo de voz: ${s.production_notes.voice_style}`,
    `Música sugerida: ${s.production_notes.music_mood}`,
  ].join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}
