import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/toast";
import { PostHogWrapper } from "@/components/providers/PostHogWrapper";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "VYNAVO — Microseries IA", template: "%s · VYNAVO" },
  description: "Crea microseries virales con IA — voz, imágenes, clips animados y video MP4 en minutos.",
  metadataBase: new URL("https://vynavo.vercel.app"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} ${display.variable}`}>
        <SessionProvider>
          <PostHogWrapper>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PostHogWrapper>
        </SessionProvider>
      </body>
    </html>
  );
}
