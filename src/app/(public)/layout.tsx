import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Logo } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/help"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-safety-50 px-3 text-sm font-semibold text-safety-700 ring-1 ring-safety-100 hover:bg-safety-100"
            >
              <LifeBuoy className="size-4" aria-hidden />
              <span>Get help now</span>
            </Link>
            <Link href="/login" className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-sand sm:inline-flex">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line/60 bg-surface/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
          <div className="max-w-md space-y-1.5">
            <p className="font-medium text-ink-soft" data-testid="product-description">
              SaveTheSoul is an AI-powered mental wellbeing and connected-care platform. Through Sakinah, users can receive supportive conversations, explore possible mental
              health concerns, complete wellbeing assessments, and prepare information for qualified healthcare professionals. Clinical diagnoses and treatment decisions remain
              with licensed professionals.
            </p>
            <p>
              AI-assisted wellbeing support and preliminary insights. Not a substitute for professional diagnosis or treatment, and not an emergency service. In an emergency in
              the UAE call 999 (Police) or 998 (Ambulance); elsewhere, call your local emergency number.
            </p>
            <p className="text-xs">Prototype for the Future Health Digital Innovation Challenge 2026. All people and records in the demo are synthetic.</p>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy-notice" className="hover:text-ink">Privacy & AI notice</Link>
            <Link href="/help" className="hover:text-ink">Crisis support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
