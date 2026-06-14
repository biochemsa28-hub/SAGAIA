"use client";
import { Suspense } from "react";
import { PostHogProvider } from "./PostHogProvider";

export function PostHogWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PostHogProvider>{children}</PostHogProvider>
    </Suspense>
  );
}
