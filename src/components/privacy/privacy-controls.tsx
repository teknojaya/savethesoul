"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, LogOut, Trash2, Eye, ShieldOff, Brain, MessageSquare, HeartPulse } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Callout, Input, Textarea } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const SCOPE_LABEL: Record<string, string> = {
  AI_PROCESSING: "AI processing of companion messages",
  WELLBEING_MEMORY: "Personal wellbeing memory",
  VOICE_PROCESSING: "Voice Mode: recordings transcribed and replies spoken by AI",
  SHARE_SUMMARY_WITH_CLINICIAN: "Share summary with clinician",
  TRUSTED_CONTACT_SHARING: "Share with trusted contact",
  AGGREGATE_ANALYTICS: "Anonymous service statistics",
};

interface Props {
  profile: { preferredName: string; chatHistoryEnabled: boolean; memoryEnabled: boolean; physicalHealthContext: string | null };
  memories: { id: string; content: string; createdAt: string }[];
  consents: { id: string; scope: string; granteeName: string | null; categories: string[]; grantedAt: string; revokedAt: string | null; policyVersion: string }[];
  access: { id: string; who: string; action: string; outcome: string; createdAt: string }[];
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-teal-600" : "bg-line")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} />
    </button>
  );
}

export function PrivacyControls({ profile, memories, consents, access }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [physical, setPhysical] = useState(profile.physicalHealthContext ?? "");
  const [newMemory, setNewMemory] = useState("");
  const [deleteText, setDeleteText] = useState("");

  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      if (success) setMessage(success);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const setPref = (patch: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    run("pref", () => api("/api/me/preferences", { method: "PATCH", body: patch }), "Saved.");
  };

  return (
    <div className="space-y-6">
      {message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Companion settings</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-line">
          <div className="flex items-start gap-4 py-3">
            <MessageSquare className="mt-0.5 size-5 text-teal-600" aria-hidden />
            <div className="flex-1">
              <p className="font-medium text-ink">Keep conversation history</p>
              <p className="text-sm text-muted">Turning this off permanently deletes all saved conversations.</p>
            </div>
            <Switch
              label="Keep conversation history"
              checked={profile.chatHistoryEnabled}
              disabled={busy === "pref"}
              onChange={(v) => setPref({ chatHistoryEnabled: v }, v ? undefined : "Turn off history and delete all saved conversations?")}
            />
          </div>
          <div className="flex items-start gap-4 py-3">
            <Brain className="mt-0.5 size-5 text-teal-600" aria-hidden />
            <div className="flex-1">
              <p className="font-medium text-ink">Personal wellbeing memory</p>
              <p className="text-sm text-muted">Short notes you choose to save so the companion can remember them. Turning off deletes them all.</p>
            </div>
            <Switch
              label="Personal wellbeing memory"
              checked={profile.memoryEnabled}
              disabled={busy === "pref"}
              onChange={(v) => setPref({ memoryEnabled: v }, v ? undefined : "Turn off memory and delete all saved memories?")}
            />
          </div>
          {profile.memoryEnabled && (
            <div className="space-y-2 py-3">
              {memories.length === 0 && <p className="text-sm text-muted">No memories saved yet. Use “Remember this” in the companion, or add one below.</p>}
              <ul className="space-y-1.5">
                {memories.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl bg-sand/50 px-3 py-2 text-sm">
                    <span className="flex-1">{m.content}</span>
                    <button
                      onClick={() => run("mem" + m.id, () => api(`/api/memories/${m.id}`, { method: "DELETE" }))}
                      className="rounded-lg p-1.5 text-muted hover:bg-safety-50 hover:text-safety-600"
                      aria-label="Delete memory"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newMemory.trim()) run("addmem", () => api("/api/memories", { body: { content: newMemory } }).then(() => setNewMemory("")));
                }}
              >
                <Input placeholder="e.g. Talking to my sister helps" value={newMemory} maxLength={300} onChange={(e) => setNewMemory(e.target.value)} aria-label="New memory" />
                <Button type="submit" variant="soft" disabled={!newMemory.trim()}>Add</Button>
              </form>
            </div>
          )}
          <div className="py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-safety-700"
              onClick={() => confirm("Delete all conversations permanently?") && run("delconv", () => api("/api/conversations", { method: "DELETE" }), "All conversations deleted.")}
            >
              <Trash2 aria-hidden /> Delete all conversations
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HeartPulse className="size-4 text-teal-600" aria-hidden /> Physical health context (optional)</CardTitle>
          <CardDescription>Anything you'd like a clinician to know if you choose to share it, such as long-term conditions. Encrypted; never shared unless you include it in a summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={3} maxLength={1000} value={physical} onChange={(e) => setPhysical(e.target.value)} aria-label="Physical health context" />
          <Button size="sm" variant="secondary" onClick={() => setPref({ physicalHealthContext: physical.trim() || null })}>Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consent record</CardTitle>
          <CardDescription>Every permission you've given, when, and its current status. Revoking takes effect immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-testid="consent-row">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {SCOPE_LABEL[c.scope] ?? c.scope}
                    {c.granteeName && <span className="text-muted"> · {c.granteeName}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    Granted {formatDate(c.grantedAt)}
                    {c.categories.length > 0 && ` · ${c.categories.length} categories`} · policy {c.policyVersion}
                    {c.revokedAt && ` · revoked ${formatDate(c.revokedAt)}`}
                  </p>
                </div>
                {c.revokedAt ? (
                  <Badge tone="neutral">Revoked</Badge>
                ) : (
                  <>
                    <Badge tone="teal">Active</Badge>
                    {c.scope !== "AI_PROCESSING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-safety-700"
                        disabled={busy === c.id}
                        onClick={() => confirm("Revoke this permission now?") && run(c.id, () => api(`/api/consents/${c.id}/revoke`, { method: "POST" }), "Permission revoked.")}
                        data-testid="revoke-consent"
                      >
                        <ShieldOff aria-hidden /> Revoke
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">To stop AI processing entirely, you can delete your account below.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eye className="size-4 text-teal-600" aria-hidden /> Who accessed my information</CardTitle>
          <CardDescription>Clinician access to your shared information is logged. Logs never include content.</CardDescription>
        </CardHeader>
        <CardContent>
          {access.length === 0 ? (
            <p className="text-sm text-muted">No clinician has accessed your information.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {access.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-sand/40 px-3 py-2">
                  <span><span className="font-medium">{a.who}</span> · {a.action.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="text-xs text-muted">{a.outcome === "DENIED" ? "Denied · " : ""}{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <a href="/api/privacy/export" className={buttonVariants({ variant: "secondary" })}>
              <Download aria-hidden /> Export all my data (JSON)
            </a>
            <Button
              variant="ghost"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut aria-hidden /> Sign out
            </Button>
          </div>
          <Callout tone="safety" icon={<Trash2 />}>
            <p className="font-semibold">Delete my account</p>
            <p className="mt-0.5">Permanently deletes your profile, conversations, check-ins, assessments, contacts, consents and shared summaries. This cannot be undone.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input className="max-w-40" placeholder='Type "DELETE"' value={deleteText} onChange={(e) => setDeleteText(e.target.value)} aria-label="Type DELETE to confirm" />
              <Button
                variant="safety"
                disabled={deleteText !== "DELETE" || busy === "delete"}
                onClick={() =>
                  run("delete", async () => {
                    await api("/api/privacy/delete-account", { body: { confirmation: "DELETE" } });
                    router.replace("/");
                  })
                }
              >
                {busy === "delete" && <Loader2 className="animate-spin" aria-hidden />} Delete permanently
              </Button>
            </div>
          </Callout>
        </CardContent>
      </Card>
    </div>
  );
}
