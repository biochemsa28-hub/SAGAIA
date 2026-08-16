import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const EXTS = ["", ".ts", ".tsx", "/index.ts", ".js", "/index.js"];

const conExtension = (url) => {
  for (const ext of EXTS) {
    const cand = new URL(url.href + ext);
    try { if (existsSync(fileURLToPath(cand))) return cand.href; } catch { /* no es file: */ }
  }
  return null;
};

export async function resolve(specifier, context, next) {
  // "@/lib/x" → <raíz>/lib/x(.ts)
  if (specifier.startsWith("@/")) {
    const hit = conExtension(new URL(specifier.slice(2), ROOT));
    if (hit) return next(hit, context);
  }
  // "./style-presets" sin extensión (TypeScript lo permite; node no)
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const hit = conExtension(new URL(specifier, context.parentURL));
    if (hit) return next(hit, context);
  }
  return next(specifier, context);
}
