"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound, Stethoscope, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import type { DEMO_GROUPS, DemoLoginKey } from "@/features/demo/accounts";

export function LoginForm({ demoGroups }: { demoGroups: typeof DEMO_GROUPS }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  /** Server-side one-click sign-in to a synthetic demo account (no password in the browser). */
  async function demoSignIn(key: DemoLoginKey) {
    setError(null);
    setPending(key);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/demo-login", { body: { account: key } });
      router.replace(res.redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
      setPending(null);
    }
  }

  async function signIn(e: string, p: string, key: string) {
    setError(null);
    setPending(key);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/login", { body: { email: e, password: p } });
      router.replace(res.redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          signIn(email, password, "form");
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!!pending}>
          {pending === "form" && <Loader2 className="animate-spin" aria-hidden />} Sign in
        </Button>
      </form>

      {demoGroups.length > 0 && (
        <div className="space-y-3" data-testid="demo-roles">
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-line" /> One-click demo · synthetic accounts <span className="h-px flex-1 bg-line" />
          </div>
          {demoGroups.map((g) => {
            const Icon = g.title.startsWith("Hospital") ? Siren : g.title.startsWith("Clinician") ? Stethoscope : UserRound;
            return (
              <section key={g.title} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-4" aria-hidden /></span>
                  {g.title}
                </p>
                <p className="mt-1 text-sm text-muted">{g.description}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {g.accounts.map((a) => (
                    <Button
                      key={a.key}
                      variant="secondary"
                      className="h-auto justify-start rounded-xl px-3 py-2.5 text-start"
                      disabled={!!pending}
                      onClick={() => demoSignIn(a.key)}
                      data-testid={`demo-${a.key}`}
                    >
                      {pending === a.key && <Loader2 className="animate-spin" aria-hidden />}
                      <span className="flex flex-col leading-tight">
                        <span className="font-semibold">{a.label}</span>
                        <span className="text-xs font-normal text-muted">{a.role}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
