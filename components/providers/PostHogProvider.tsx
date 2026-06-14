"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Init once
  useEffect(() => {
    if (initialized.current) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: true,
      persistence: "localStorage",
    });
    initialized.current = true;
  }, []);

  // Identify user when session loads
  useEffect(() => {
    if (!initialized.current || !session?.user) return;
    const user = session.user;
    if (user.id) {
      posthog.identify(user.id, {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      });
    }
  }, [session]);

  // Track page views on route change
  useEffect(() => {
    if (!initialized.current) return;
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}

// Client-side capture helper — use this anywhere in client components
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, properties);
}
