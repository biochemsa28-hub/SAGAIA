"use client";
import { useEffect, useRef, useState } from "react";

// Animated number that counts up from 0 to `value` on mount (and whenever value
// changes). Gives the dashboards/stat chips their "alive" dopamine feel.
export function CountUp({
  value,
  durationMs = 1100,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, durationMs]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("es");

  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}
