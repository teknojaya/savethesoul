"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reads one of Sakinah's saved replies aloud (two-part speech endpoint: short opening first).
 * One audio element, so replies never overlap; audio is cached per message so "Listen again"
 * makes no new paid request. Only saved, safety-checked messages can be spoken (server rule).
 */
export function useReplySpeech(onBeforeAudio?: () => void) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const cache = useRef(new Map<string, Promise<string | null>[]>());

  const stop = useCallback(() => {
    token.current++;
    audio.current?.pause();
    setSpeakingId(null);
  }, []);

  useEffect(() => {
    const c = cache.current;
    const t = token;
    const el = audio;
    return () => {
      t.current++;
      el.current?.pause();
      c.forEach((parts) => parts.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {})));
    };
  }, []);

  const speak = useCallback(
    async (messageId: string) => {
      onBeforeAudio?.();
      const my = ++token.current;
      audio.current?.pause();
      setError(null);
      setSpeakingId(messageId);
      let parts = cache.current.get(messageId);
      if (!parts) {
        const fetchPart = async (part: number) => {
          const res = await fetch("/api/voice/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, part }) });
          if (res.status === 204) return null;
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Sakinah's voice isn't available just now.");
          return URL.createObjectURL(await res.blob());
        };
        parts = [fetchPart(0), fetchPart(1).catch(() => null)];
        parts[0].catch(() => cache.current.delete(messageId));
        cache.current.set(messageId, parts);
      }
      if (!audio.current) audio.current = new Audio();
      const a = audio.current;
      for (const p of parts) {
        let url: string | null;
        try {
          url = await p;
        } catch (e) {
          if (my === token.current) {
            setError(e instanceof Error ? e.message : "Sakinah's voice isn't available just now.");
            setSpeakingId(null);
          }
          return;
        }
        if (my !== token.current) return;
        if (!url) continue;
        const ok = await new Promise<boolean>((resolve) => {
          a.onended = () => resolve(my === token.current);
          a.onerror = () => resolve(false);
          a.src = url;
          a.play().catch(() => {
            setError("Your browser blocked audio. Tap Listen to hear Sakinah.");
            resolve(false);
          });
        });
        if (!ok) break;
      }
      if (my === token.current) setSpeakingId(null);
    },
    [onBeforeAudio],
  );

  return { speakingId, error, speak, stop };
}
