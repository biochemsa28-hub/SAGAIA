import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCast, MAX_CAST } from "@/lib/ai/casting";
import { generateCharacterOptions } from "@/services/fal/image-generator";
import { getUserCredits } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  niche: z.string().min(1),
  sub_niche: z.string().optional(),
  topic: z.string().min(1),
  tone: z.string().min(1),
  language: z.string().default("es"),
  visual_style: z.string().default("cinematic"),
  max_characters: z.number().int().min(1).max(MAX_CAST).optional(),
});

// How many portrait options to generate per character (cost control).
const OPTIONS_PER_CHAR = Math.min(Math.max(Number(process.env.CASTING_OPTIONS ?? 2) || 2, 1), 4);

// POST /api/casting/generate — design the cast for a story and generate portrait
// OPTIONS for each character so the user can pick. Nothing is saved yet.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Cost gate ──────────────────────────────────────────────────────────────
    // Casting generates real portraits (fal credits). Protect it from abuse:
    //  1) Rate-limit per user/IP so nobody can spam the endpoint.
    //  2) Require a positive credit balance (we DON'T deduct here — story
    //     generation deducts the actual credit — but a 0-credit user can't burn
    //     fal credits just by re-rolling casts).
    const ip = getClientIp(req);
    const rl = rateLimit(`casting:${session.user.id}:${ip}`, { limit: 12, windowSecs: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiados elencos generados. Espera un momento antes de continuar." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    await initDb();
    const credits = await getUserCredits(session.user.id).catch(() => 0);
    if (credits <= 0) {
      return NextResponse.json(
        { error: "Sin NAVOS suficientes. Recarga para diseñar tu elenco.", credits: 0 },
        { status: 402 }
      );
    }

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos de la historia inválidos" }, { status: 400 });

    // 1) Design the cast (ChatGPT/Claude)
    const result = await generateCast(parsed.data);
    if (!result.success || !result.cast) {
      return NextResponse.json({ error: result.error ?? "No se pudo diseñar el elenco" }, { status: 502 });
    }

    // 2) Generate portrait options for each character (parallel, cost-capped)
    const errors: string[] = [];
    const characters = await Promise.all(
      result.cast.cast.map(async (member) => {
        const opts = await generateCharacterOptions({
          description: member.visual_description,
          niche: parsed.data.niche,
          visualStyle: parsed.data.visual_style,
          count: OPTIONS_PER_CHAR,
        });
        if (!opts.success) {
          // Used to be discarded: opts.error vanished and the response still said
          // success:true, so the screen could only render "sin opciones de retrato"
          // — the symptom, never the cause.
          const why = opts.error ?? "sin detalle";
          console.error(`[casting] retratos fallaron para ${member.name}: ${why}`);
          errors.push(`${member.name}: ${why}`);
        }
        return { ...member, options: opts.success ? opts.urls : [] };
      })
    );

    const conRetratos = characters.filter((c) => c.options.length > 0).length;
    console.log(`[casting] ${conRetratos}/${characters.length} personajes con retratos`);

    // Every portrait failing is a failure, not a success with empty arrays.
    if (conRetratos === 0) {
      return NextResponse.json({ success: false, characters, error: ("No se pudo generar ningún retrato. " + (errors[0] ?? "")).trim() }, { status: 502 });
    }

    return NextResponse.json({ success: true, characters, ...(errors.length ? { warnings: errors } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /casting/generate]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
