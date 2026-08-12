import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { guardarMotionDna, listarMotionDna, aplicarMotionDna, borrarMotionDna } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

// Motion DNA — el movimiento como algo que se guarda y se reutiliza.
//
// Hasta ahora, si una toma salía bien, esa forma de moverse se perdía con el
// video: la próxima historia empezaba de cero y había que tener suerte otra vez.
// Guardar cámara + emoción + ambiente con un nombre convierte eso en un activo.
//
// Barato a propósito: lo que se guarda es la MISMA metadata que el generador ya
// sabe leer, así que aplicar un DNA es escribir tres campos — no hay modelo
// nuevo, ni análisis, ni un centavo de gasto.

const GuardarSchema = z.object({
  action: z.literal("guardar"),
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  name: z.string().min(1).max(60),
});
const AplicarSchema = z.object({
  action: z.literal("aplicar"),
  dna_id: z.string().uuid(),
  project_id: z.string().uuid(),
  scene_numbers: z.array(z.number().int().positive()).min(1).max(40),
});
const BorrarSchema = z.object({ action: z.literal("borrar"), dna_id: z.string().uuid() });

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await initDb();
    return NextResponse.json({ success: true, dna: await listarMotionDna(session.user.id) });
  } catch (err) {
    console.error("[API /motion-dna GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const body: unknown = await req.json().catch(() => null);

    const guardar = GuardarSchema.safeParse(body);
    if (guardar.success) {
      const dna = await guardarMotionDna({
        userId: session.user.id,
        projectId: guardar.data.project_id,
        sceneNumber: guardar.data.scene_number,
        name: guardar.data.name,
      });
      if (!dna) {
        return NextResponse.json(
          { error: "Esa escena no tiene un movimiento que guardar (sin cámara ni emoción)." },
          { status: 422 },
        );
      }
      return NextResponse.json({ success: true, dna });
    }

    const aplicar = AplicarSchema.safeParse(body);
    if (aplicar.success) {
      const n = await aplicarMotionDna({
        userId: session.user.id,
        dnaId: aplicar.data.dna_id,
        projectId: aplicar.data.project_id,
        sceneNumbers: aplicar.data.scene_numbers,
      });
      if (!n) return NextResponse.json({ error: "No se aplicó a ninguna escena" }, { status: 404 });
      return NextResponse.json({ success: true, escenas: n });
    }

    const borrar = BorrarSchema.safeParse(body);
    if (borrar.success) {
      const ok = await borrarMotionDna(session.user.id, borrar.data.dna_id);
      if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    console.error("[API /motion-dna POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
