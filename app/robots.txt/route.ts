import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(
    `User-agent: *
Allow: /
Allow: /pricing
Disallow: /dashboard
Disallow: /api

Sitemap: https://sagaia.vercel.app/sitemap.xml`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
