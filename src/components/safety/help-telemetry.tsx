"use client";

import { useEffect } from "react";

/** Records an anonymous, aggregate "help page opened" count (no identity, no content). */
export function HelpTelemetry() {
  useEffect(() => {
    try {
      navigator.sendBeacon?.("/api/safety/telemetry", new Blob([JSON.stringify({ code: "HELP_OPENED" })], { type: "application/json" }));
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
