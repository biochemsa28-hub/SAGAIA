"use client";

import Image from "next/image";

// ─── Miniatura remota optimizada ─────────────────────────────────────────────
// Las imágenes generadas pesan 1–3 MB cada una (1080×1920). El dashboard las
// mostraba con <img> crudo, así que una grilla de 10 escenas descargaba ~20 MB
// para pintar miniaturas de 200 px. next/image las sirve reducidas y en webp
// desde el propio servidor (~30 KB por miniatura).
//
// Solo se optimizan los hosts declarados en next.config remotePatterns; para
// cualquier otro origen (blob:, data:, un host nuevo) se cae a <img> normal:
// una miniatura sin optimizar es preferible a una miniatura rota.
const OPTIMIZABLES = [
  /\.r2\.dev$/i,
  /\.r2\.cloudflarestorage\.com$/i,
  /\.cloudflare\.com$/i,
  /\.fal\.media$/i,
  /\.shotstack\.io$/i,
];

function esOptimizable(src: string): boolean {
  if (src.startsWith("/")) return true; // asset local de /public
  try {
    return OPTIMIZABLES.some((re) => re.test(new URL(src).hostname));
  } catch {
    return false;
  }
}

export default function Thumb({ src, alt, sizes = "50vw", className = "" }: {
  src: string;
  alt: string;
  /** Ancho que la miniatura ocupa en pantalla, p. ej. "40px" o "(max-width: 768px) 50vw, 25vw". */
  sizes?: string;
  className?: string;
}) {
  if (!esOptimizable(src)) {
    // Mismo layout que <Image fill>: llena el contenedor posicionado.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    );
  }
  // fill: ocupa el contenedor posicionado más cercano (todos los usos viven en
  // contenedores relative con aspect fijo).
  return <Image src={src} alt={alt} fill sizes={sizes} className={className} />;
}
