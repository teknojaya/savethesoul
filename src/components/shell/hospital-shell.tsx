"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ScrollText, LogOut } from "lucide-react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/hospital", label: "Emergency dashboard", icon: LayoutDashboard, exact: true },
  { href: "/hospital/audit", label: "Audit records", icon: ScrollText },
];

export function HospitalShell({ name, organization, children }: { name: string; organization: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line/70 bg-surface px-4 py-5 lg:flex">
        <Logo href="/hospital" subtitle="Hospital emergency" />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Hospital">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href, i.exact) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium",
                active(i.href, i.exact) ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-sand/70",
              )}
            >
              <i.icon className="size-[18px]" aria-hidden />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-line p-3 text-sm">
          <p className="font-medium text-ink">{name}</p>
          <p className="text-xs text-muted">{organization}</p>
          <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700" title="Demo account">Demo</span>
          <button onClick={signOut} className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <LogOut className="size-3.5" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line/60 bg-surface/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Logo href="/hospital" subtitle="Hospital" />
            <button onClick={signOut} className="rounded-lg p-2 text-muted" aria-label="Sign out"><LogOut className="size-4" /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Hospital">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", active(i.href, i.exact) ? "bg-brand-50 font-medium text-brand-700" : "text-ink-soft")}
              >
                {i.label}
              </Link>
            ))}
          </nav>
        </header>
        <main id="main" className="flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <div className="mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
