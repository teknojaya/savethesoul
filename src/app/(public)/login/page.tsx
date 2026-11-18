import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { getCurrentActor } from "@/lib/auth/current-user";
import { DEMO_ACCOUNTS } from "@/features/demo/accounts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const actor = await getCurrentActor();
  if (actor) redirect(actor.role === "CLINICIAN" ? "/clinician" : "/patient");
  const demo = getEnv().DEMO_MODE;
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 md:py-16">
      <div>
        <h1 className="font-display text-[32px] text-ink">Welcome back</h1>
        <p className="mt-1 text-muted">Sign in to your companion or clinician portal.</p>
        <div className="mt-6">
          <LoginForm demoAccounts={demo ? [...DEMO_ACCOUNTS] : []} />
        </div>
        <p className="mt-6 text-sm text-muted">
          New here?{" "}
          <Link href="/register" className="font-medium text-teal-700 hover:underline">
            Create a private account
          </Link>
        </p>
      </div>
      {demo && (
        <aside className="rounded-3xl border border-amber-500/20 bg-amber-50/70 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Demo mode for judges</p>
          <h2 className="mt-1 font-display text-xl text-ink">Explore with synthetic accounts</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Every person, clinician and record here is fictional. Alerts, referrals and notifications are simulated — nothing is sent to real people or hospitals.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="rounded-xl bg-surface/80 p-3">
                <p className="font-medium text-ink">
                  {a.label} <span className="text-muted">· {a.role}</span>
                </p>
                <p className="text-xs text-muted">{a.scenario}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Use the one-click buttons on the left. See HACKATHON_SUBMISSION.md for a guided walkthrough.</p>
        </aside>
      )}
    </div>
  );
}
