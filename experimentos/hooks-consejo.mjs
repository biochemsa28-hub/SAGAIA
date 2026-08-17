// Reproduce el prompt de /api/generate/hooks (system + user) tal como está en el
// archivo, y lo corre con el mismo modelo, para ver los ganchos en modo consejo.
import { readFileSync } from "node:fs";
import OpenAI from "openai";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).replace(/^["']|["']$/g,"")]));
const src = readFileSync("app/api/generate/hooks/route.ts","utf8");
const system = src.match(/const HOOK_SYSTEM = `([\s\S]*?)`;/)[1];
const userTpl = src.match(/return `(Escribí las 3 primeras líneas[\s\S]*?)`;\n\}/)[1];
const input = { topic: process.argv[2] ?? "cómo superar una infidelidad", niche: "romance", tone: "romance", language: "es", format: "consejo", cast_names: ["Tamara Solano", "Emilio Rojas"] };
const langMap = { es: "español latinoamericano" };
const user = eval("`" + userTpl.replace(/\`/g, "`") + "`");
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const r = await client.chat.completions.create({ model: env.OPENAI_MODEL ?? "gpt-4o", temperature: 0.9, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
for (const h of JSON.parse(r.choices[0].message.content).hooks) console.log(`[${h.type_label}] "${h.text}"`);
