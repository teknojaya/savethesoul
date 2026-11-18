"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Field, Input } from "@/components/ui/primitives";
import { api, ApiError, fieldErrors } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ preferredName: "", email: "", password: "", acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setError(null);
    try {
      await api("/api/auth/register", { body: form });
      router.replace("/onboarding");
      router.refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof ApiError ? err.message : "Could not create your account.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <h1 className="font-display text-[32px] text-ink">Create your private space</h1>
      <p className="mt-1 text-muted">It takes a minute. You choose what's stored and who sees anything.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field label="What would you like to be called?" htmlFor="name" hint="A first name or nickname is enough." error={errors.preferredName}>
          <Input id="name" required value={form.preferredName} onChange={(e) => setForm({ ...form, preferredName: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters with a letter and a number." error={errors.password}>
          <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-teal-600"
            checked={form.acceptTerms}
            onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
          />
          <span>
            I understand SaveTheSoul is an AI wellbeing companion, not a medical or emergency service, and I've read the{" "}
            <Link href="/privacy-notice" className="font-medium text-teal-700 underline-offset-2 hover:underline" target="_blank">
              privacy & AI notice
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms && <p className="text-xs text-safety-600">{errors.acceptTerms}</p>}
        {error && !Object.keys(errors).length && (
          <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Create account
        </Button>
      </form>
      <Callout tone="teal" icon={<ShieldCheck />} className="mt-6">
        Clinician accounts are created by the care organisation after licence verification — they can't be self-registered.
      </Callout>
    </div>
  );
}
