import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/upload — receives an image (FormData "file"), uploads it to fal.storage
// and returns its public URL. Used so creators can put their REAL product / creative
// asset into the generated ad (the "made with AI but looks real" moment).
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!process.env.FAL_API_KEY) return NextResponse.json({ error: "Almacenamiento no configurado" }, { status: 500 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen supera los 12 MB" }, { status: 413 });
    if (file.type && !ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Formato no soportado (usa JPG, PNG o WEBP)" }, { status: 415 });
    }

    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const buffer = Buffer.from(await file.arrayBuffer());

    // Unified storage: Cloudflare R2 when configured (durable, cheap, decoupled from
    // fal balance), otherwise fal.storage. See services/storage.
    const { uploadBuffer } = await import("@/services/storage");
    const { url } = await uploadBuffer({ buffer, ext, contentType: file.type || "image/jpeg", folder: "uploads" });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const body = JSON.stringify((err as Record<string, unknown>)?.["body"] ?? "");
    console.error("[API /upload]", message, body.slice(0, 200));
    // Surface the real, actionable cause (e.g. provider out of balance).
    if (/locked|exhausted balance|insufficient/i.test(body) || message.includes("Forbidden")) {
      return NextResponse.json({ error: "El almacenamiento está temporalmente sin saldo. Recarga tu cuenta de fal.ai." }, { status: 402 });
    }
    return NextResponse.json({ error: "No se pudo subir la imagen. Intenta de nuevo." }, { status: 500 });
  }
}
