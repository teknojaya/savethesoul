"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { DEMO_PASSWORD } from "@/features/demo/accounts";

interface DemoAccount {
  email: string;
  label: string;
  role: string;
}

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

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

      {demoAccounts.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-line" /> One-click demo <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((a) => {
              const Icon = a.role === "Patient" ? UserRound : Stethoscope;
              return (
                <Button
                  key={a.email}
                  variant="secondary"
                  className="h-auto justify-start rounded-2xl px-4 py-3 text-start"
                  disabled={!!pending}
                  onClick={() => signIn(a.email, DEMO_PASSWORD, a.email)}
                  data-testid={`demo-${a.email.split("@")[0]}`}
                >
                  {pending === a.email ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
                  <span className="flex flex-col leading-tight">
                    <span className="font-semibold">{a.label}</span>
                    <span className="text-xs font-normal text-muted">{a.role}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
