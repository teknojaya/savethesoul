import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-8", className)}>
      <rect width="40" height="40" rx="12" fill="#2f7f7a" />
      <path
        d="M20 30.5c-.5 0-1-.2-1.4-.5C13.4 25.8 10 22.6 10 18.4 10 15.4 12.3 13 15.2 13c1.9 0 3.5 1 4.8 2.7C21.3 14 22.9 13 24.8 13c2.9 0 5.2 2.4 5.2 5.4 0 4.2-3.4 7.4-8.6 11.6-.4.3-.9.5-1.4.5Z"
        fill="#f7f5f0"
      />
      <path d="M15 19.5c1.6 2.2 3.3 3.3 5 3.3s3.4-1.1 5-3.3" stroke="#7d9a78" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className, subtitle }: { href?: string; className?: string; subtitle?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)} aria-label="SaveTheSoul home">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[19px] text-ink">SaveTheSoul</span>
        {subtitle && <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
