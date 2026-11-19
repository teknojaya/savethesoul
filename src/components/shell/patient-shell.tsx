"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, MessageCircleHeart, LineChart, Compass, Users, UserRound, LifeBuoy, LogOut } from "lucide-react";
import { Logo } from "@/components/brand";
import { NAV } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/patient", label: NAV.en.dashboard, icon: Home, exact: true },
  { href: "/patient/companion", label: NAV.en.companion, icon: MessageCircleHeart },
  { href: "/patient/wellbeing", label: NAV.en.wellbeing, icon: LineChart },
  { href: "/patient/support", label: NAV.en.support, icon: Compass },
  { href: "/patient/circle", label: NAV.en.circle, icon: Users },
  { href: "/patient/privacy", label: NAV.en.privacy, icon: UserRound },
];

export function PatientShell({ name, isDemo, children }: { name: string; isDemo: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isChat = pathname.startsWith("/patient/companion");

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line/70 bg-surface/70 px-4 py-5 lg:flex">
        <Logo href="/patient" />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href, i.exact) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                active(i.href, i.exact) ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-sand/70",
              )}
            >
              <i.icon className="size-[18px]" aria-hidden />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <Link
            href="/help"
            className="flex items-center gap-3 rounded-xl bg-safety-50 px-3 py-3 text-sm font-semibold text-safety-700 ring-1 ring-safety-100 hover:bg-safety-100"
          >
            <LifeBuoy className="size-[18px]" aria-hidden /> {NAV.en.getHelp}
          </Link>
          <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm">
            <span className="truncate text-ink-soft">
              {name}
              {isDemo && <span className="ms-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Demo</span>}
            </span>
            <button onClick={signOut} className="rounded-lg p-1.5 text-muted hover:bg-sand hover:text-ink" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className={cn("sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line/60 bg-canvas/90 px-4 backdrop-blur lg:hidden", isChat && "hidden")}>
          <Logo href="/patient" />
          <div className="flex items-center gap-1.5">
            <Link
              href="/help"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-safety-50 px-3 text-sm font-semibold text-safety-700 ring-1 ring-safety-100"
            >
              <LifeBuoy className="size-4" aria-hidden /> Help
            </Link>
            <Link
              href="/patient/privacy"
              aria-label="Profile and privacy"
              className={cn("rounded-full p-2", active("/patient/privacy") ? "bg-brand-50 text-brand-700" : "text-ink-soft")}
            >
              <UserRound className="size-5" />
            </Link>
          </div>
        </header>

        <main id="main" className={cn("flex-1", isChat ? "" : "px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10")}>
          {isChat ? children : <div className="mx-auto w-full max-w-5xl">{children}</div>}
        </main>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Main"
          className={cn(
            "pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/70 bg-surface/95 px-1 pt-1.5 backdrop-blur lg:hidden",
            isChat && "hidden",
          )}
        >
          {ITEMS.slice(0, 5).map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href, i.exact) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-medium",
                active(i.href, i.exact) ? "text-brand-700" : "text-muted",
              )}
            >
              <i.icon className={cn("size-[22px]", active(i.href, i.exact) && "stroke-[2.25]")} aria-hidden />
              <span className="truncate">{i.label.replace("My ", "").replace("Find ", "").replace("Trusted ", "")}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
