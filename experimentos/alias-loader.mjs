// Resuelve los imports "@/..." del código de producción cuando se corre con
// node suelto (fuera de Next). Uso:
//   node --import ./experimentos/alias-loader.mjs experimentos/lo-que-sea.mjs
import { register } from "node:module";
register(new URL("./alias-hooks.mjs", import.meta.url));
