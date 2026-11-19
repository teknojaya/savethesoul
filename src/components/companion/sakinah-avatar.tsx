import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Sakinah's avatar: an original, simple illustration of a calm, friendly woman in the
 * SaveTheSoul blue palette. Decorative (the name is always shown next to it), so it is
 * hidden from screen readers unless a label is passed.
 */
export function SakinahAvatar({ className, label }: { className?: string; label?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0 rounded-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid="sakinah-avatar"
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF3FF" />
          <stop offset="1" stopColor="#C2DAFB" />
        </linearGradient>
        <linearGradient id={`top-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DAE9A" />
          <stop offset="1" stopColor="#5E937F" />
        </linearGradient>
        <clipPath id={`clip-${id}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        <rect width="64" height="64" fill={`url(#bg-${id})`} />
        {/* hair, back */}
        <path d="M16.5 31c0-11.5 7-19 15.5-19s15.5 7.5 15.5 19v13.5c0 4.2-3 6.5-6.5 6.5h-18c-3.5 0-6.5-2.3-6.5-6.5z" fill="#3E2C28" />
        {/* shoulders */}
        <path d="M9 64c1.2-10.5 10.5-15.5 23-15.5S53.8 53.5 55 64z" fill={`url(#top-${id})`} />
        {/* neck */}
        <path d="M27.2 40.5h9.6v8.8c0 2.6-2.1 4.2-4.8 4.2s-4.8-1.6-4.8-4.2z" fill="#C88D6A" />
        {/* neckline */}
        <path d="M26.5 49.5 32 55l5.5-5.5" fill="none" stroke="#F3EEE4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {/* face */}
        <ellipse cx="32" cy="31" rx="10.4" ry="11.8" fill="#D9A07C" />
        {/* hair, front: soft side-swept fringe */}
        <path d="M21.4 30.5c.6-8.6 5.4-13.3 11.1-13.3 6.3 0 10.6 4.4 11.4 11.6-4.6-.6-8.6-3.4-10.6-7.6-2.1 5-6.6 8.4-11.9 9.3z" fill="#3E2C28" />
        {/* eyes: gentle, smiling */}
        <path d="M26.4 32.6q1.6 1.4 3.2 0M34.4 32.6q1.6 1.4 3.2 0" fill="none" stroke="#3E2C28" strokeWidth="1.3" strokeLinecap="round" />
        {/* cheeks */}
        <circle cx="25.8" cy="36.1" r="1.9" fill="#E58C78" opacity=".35" />
        <circle cx="38.2" cy="36.1" r="1.9" fill="#E58C78" opacity=".35" />
        {/* smile */}
        <path d="M29.4 38.4q2.6 2.1 5.2 0" fill="none" stroke="#8B4A3B" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
