"use client";

import { useEffect, useRef } from "react";
import type { AppState } from "@/lib/state";

// Cloudflare Turnstile, loaded only when the server asks for the check.
// Usually it finishes by itself; sometimes it asks for one click.

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject()));
    tag.addEventListener("error", () => reject());
  });
}

export function HumanCheck({
  siteKey,
  onPassed,
  onError,
}: {
  siteKey: string;
  onPassed: (state: AppState) => void;
  onError: (message: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widget: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((t) => {
        if (cancelled || !box.current) return;
        widget = t.render(box.current, {
          sitekey: siteKey,
          action: "start",
          theme: "auto",
          callback: async (token: string) => {
            onError(null);
            const res = await fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (!res.ok) return onError(data.error ?? "The check didn't pass. Please refresh and try again.");
            onPassed(data as AppState);
          },
          "error-callback": () => onError("The check couldn't load. Please refresh the page."),
        });
      })
      .catch(() => onError("The check couldn't load. Please refresh the page."));
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, onPassed, onError]);

  return <div ref={box} style={{ minHeight: 65 }} />;
}
