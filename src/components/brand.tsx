import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** The SaveTheSoul mark: a heart held by caring hands, with a person and a conversation. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/brand/logo-mark.png" alt="" width={128} height={128} priority className={cn("size-9 shrink-0", className)} aria-hidden />;
}

export function Logo({ href = "/", className, subtitle }: { href?: string; className?: string; subtitle?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2", className)} aria-label="SaveTheSoul home">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[20px] tracking-[-0.02em]">
          <span className="text-brand-900">Save</span>
          <span className="text-brand-600">TheSoul</span>
        </span>
        {subtitle && <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
