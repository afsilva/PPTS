"use client";

import { useEffect, useRef, useState } from "react";
import { elapsedFromBaseline, formatClock, formatDuration } from "./timer-format";

export function LiveTimer({
  baselineSeconds,
  className,
}: {
  baselineSeconds: number;
  className?: string;
}) {
  const baseline = Math.max(0, Math.floor(baselineSeconds));
  const baselineRef = useRef(baseline);
  const mountedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(baseline);

  useEffect(() => {
    const mountedAt = Date.now();
    mountedAtRef.current = mountedAt;
    const update = () => {
      const origin = mountedAtRef.current;
      if (origin === null) return;
      setElapsed(elapsedFromBaseline(baselineRef.current, origin, Date.now()));
    };
    update();
    const timer = window.setInterval(update, 1000);
    const catchUp = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, []);

  return (
    <p className={className} aria-label={`${formatDuration(elapsed)} elapsed`} aria-live="off">
      {formatClock(elapsed)}
    </p>
  );
}
