"use client";

import { useEffect } from "react";

/** Announces PRG feedback once, then removes the durable result token from history. */
export function MutationNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("result")) return;
    url.searchParams.delete("result");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  return (
    <p className={className} role="status" aria-live="polite">
      {children}
    </p>
  );
}
