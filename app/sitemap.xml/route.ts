import { NextResponse } from "next/server";

export function GET() {
  const base = "https://vynavo.vercel.app";
  const pages = [
    { url: base, priority: "1.0", changefreq: "weekly" },
    { url: `${base}/pricing`, priority: "0.9", changefreq: "monthly" },
    { url: `${base}/login`, priority: "0.5", changefreq: "yearly" },
    { url: `${base}/register`, priority: "0.8", changefreq: "yearly" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url>
    <loc>${p.url}</loc>
    <priority>${p.priority}</priority>
    <changefreq>${p.changefreq}</changefreq>
  </url>`).join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
