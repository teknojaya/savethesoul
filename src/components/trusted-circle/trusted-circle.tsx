"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, Trash2, UserRound, Pencil, Eye, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, SimulatedBadge } from "@/components/ui/primitives";
import { CONTACT_SHARE_CATEGORIES, type ContactShareCategory } from "@/features/consent/policy";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  canReceiveUpdates: boolean;
  canReceiveSafetyAlerts: boolean;
  sharedCategories: string[];
  isSafetyPlanContact: boolean;
  recipientVerified: boolean;
  createdAt: string;
}
interface Notification {
  id: string;
  contactName: string;
  kind: string;
  status: string;
  blockedReason: string | null;
  message: string;
  createdAt: string;
}

const RELATIONSHIPS = ["Parent", "Spouse / partner", "Sibling", "Child", "Relative", "Friend", "Colleague", "Other"] as const;
const CATS = Object.keys(CONTACT_SHARE_CATEGORIES) as ContactShareCategory[];

type FormState = Omit<Contact, "id" | "createdAt" | "recipientVerified">;
const EMPTY: FormState = {
  name: "",
  relationship: "Friend",
  phone: "",
  email: "",
  canReceiveUpdates: true,
  canReceiveSafetyAlerts: false,
  sharedCategories: ["CHECK_IN_REQUEST"],
  isSafetyPlanContact: false,
};

export function TrustedCircle({ contacts, notifications }: { contacts: Contact[]; notifications: Notification[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notifyFor, setNotifyFor] = useState<Contact | null>(null);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErrors({});
    try {
      const body = { ...editing.form, phone: editing.form.phone || null, email: editing.form.email || null };
      if (editing.id) await api(`/api/trusted-contacts/${editing.id}`, { method: "PATCH", body });
      else await api("/api/trusted-contacts", { body });
      setEditing(null);
      router.refresh();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(Object.keys(fe).length ? fe : { _: e instanceof ApiError ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Contact) {
    if (!confirm(`Remove ${c.name}? All sharing permissions for them will be revoked.`)) return;
    await api(`/api/trusted-contacts/${c.id}`, { method: "DELETE" });
    router.refresh();
  }

  const f = editing?.form;
  const set = (patch: Partial<FormState>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Trusted contacts</h2>
          {!editing && (
            <Button size="sm" onClick={() => setEditing({ id: null, form: EMPTY })} data-testid="add-contact">
              <Plus aria-hidden /> Add a person
            </Button>
          )}
        </div>

        {editing && f && (
          <Card className="border-teal-200">
            <CardHeader><CardTitle>{editing.id ? "Edit contact" : "Add a trusted person"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="c-name" error={errors.name}>
                  <Input id="c-name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <Field label="Relationship" htmlFor="c-rel">
                  <select id="c-rel" className="h-11 rounded-xl border border-line bg-surface px-3" value={f.relationship} onChange={(e) => set({ relationship: e.target.value })}>
                    {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Phone (optional)" htmlFor="c-phone" error={errors.phone}>
                  <Input id="c-phone" inputMode="tel" value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+971…" />
                </Field>
                <Field label="Email (optional)" htmlFor="c-email" error={errors.email}>
                  <Input id="c-email" type="email" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink-soft">Permissions</legend>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="accent-teal-600" checked={f.canReceiveUpdates} onChange={(e) => set({ canReceiveUpdates: e.target.checked })} />
                  May receive ordinary updates I choose to send
                </label>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="accent-teal-600" checked={f.canReceiveSafetyAlerts} onChange={(e) => set({ canReceiveSafetyAlerts: e.target.checked })} />
                  May receive a safety message I choose to send
                </label>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="accent-teal-600" checked={f.isSafetyPlanContact} onChange={(e) => set({ isSafetyPlanContact: e.target.checked })} />
                  Include in my safety plan
                </label>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink-soft">What they may be told</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CATS.map((c) => (
                    <label key={c} className={cn("flex items-start gap-2.5 rounded-xl border p-2.5 text-sm", f.sharedCategories.includes(c) ? "border-teal-200 bg-teal-50/60" : "border-line")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-teal-600"
                        checked={f.sharedCategories.includes(c)}
                        onChange={(e) => set({ sharedCategories: e.target.checked ? [...f.sharedCategories, c] : f.sharedCategories.filter((x) => x !== c) })}
                      />
                      {CONTACT_SHARE_CATEGORIES[c]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">Your scores, check-ins and conversations are never shared with trusted contacts.</p>
              </fieldset>
              {errors._ && <p role="alert" className="text-sm text-safety-700">{errors._}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={save} disabled={busy} data-testid="save-contact">{busy && <Loader2 className="animate-spin" aria-hidden />} Save</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {contacts.length === 0 && !editing && (
          <EmptyState icon={<UserRound />} title="No trusted contacts yet" description="Add someone you'd feel comfortable reaching out to on a hard day." />
        )}

        {contacts.map((c) => (
          <Card key={c.id} className="p-5" data-testid="contact-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-sage-100 font-semibold text-sage-700">{c.name.slice(0, 1)}</span>
                <div>
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-muted">{c.relationship}{c.phone ? ` · ${c.phone}` : ""}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="soft" onClick={() => setNotifyFor(c)} data-testid="notify-contact">
                  <Send aria-hidden /> Message
                </Button>
                <button className="rounded-lg p-2 text-muted hover:bg-sand" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ id: c.id, form: { ...c } })}>
                  <Pencil className="size-4" />
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-safety-50 hover:text-safety-600" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.canReceiveUpdates && <Badge tone="teal">Updates allowed</Badge>}
              {c.canReceiveSafetyAlerts && <Badge tone="safety">Safety messages allowed</Badge>}
              {c.isSafetyPlanContact && <Badge tone="sage">In safety plan</Badge>}
              {c.sharedCategories.length === 0 && <Badge tone="neutral">No sharing permitted</Badge>}
              {!c.recipientVerified && <Badge tone="outline">Contact not verified</Badge>}
            </div>
            {c.sharedCategories.length > 0 && (
              <p className="mt-2 text-xs text-muted">May be told: {c.sharedCategories.map((x) => CONTACT_SHARE_CATEGORIES[x as ContactShareCategory]?.toLowerCase()).join("; ")}</p>
            )}
            {notifyFor?.id === c.id && <NotifyPanel contact={c} onClose={() => setNotifyFor(null)} />}
          </Card>
        ))}
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Message history</CardTitle>
              <SimulatedBadge />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
            {notifications.map((n) => (
              <div key={n.id} className="rounded-xl border border-line p-3 text-sm" data-testid="notification-row">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">To {n.contactName}</span>
                  {n.status === "SIMULATED_SENT" ? (
                    <Badge tone="sage"><CheckCircle2 className="size-3" aria-hidden /> Simulated send</Badge>
                  ) : (
                    <Badge tone="safety"><Ban className="size-3" aria-hidden /> Blocked</Badge>
                  )}
                </div>
                <p className="mt-1 text-ink-soft">{n.message}</p>
                {n.blockedReason && <p className="mt-1 text-xs text-safety-700">{n.blockedReason}</p>}
                <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
              </div>
            ))}
            <p className="text-xs text-muted">Prototype: messages are recorded here but never delivered to real phones or inboxes.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NotifyPanel({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<ContactShareCategory>("CHECK_IN_REQUEST");
  const [kind, setKind] = useState<"ORDINARY_UPDATE" | "SAFETY_ALERT">("ORDINARY_UPDATE");
  const [preview, setPreview] = useState<{ preview: string; decision: { allowed: boolean; reason?: string } } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await api<{ preview: string; decision: { allowed: boolean; reason?: string } }>(`/api/trusted-contacts/${contact.id}/notify`, {
        body: { kind, category, dryRun },
      });
      if (dryRun) setPreview(res);
      else {
        setResult(res.decision.allowed ? "Simulated message recorded. Nothing was delivered to a real person." : `Blocked: ${res.decision.reason}`);
        setPreview(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-teal-100 bg-teal-50/50 p-4" data-testid="notify-panel">
      <div className="flex items-center justify-between">
        <p className="font-medium text-ink">Send a message to {contact.name}</p>
        <SimulatedBadge />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPreview(null); }} aria-label="Message type">
          <option value="ORDINARY_UPDATE">Ordinary update</option>
          <option value="SAFETY_ALERT">Safety message</option>
        </select>
        <select className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" value={category} onChange={(e) => { setCategory(e.target.value as ContactShareCategory); setPreview(null); }} aria-label="What to share">
          {CATS.map((c) => <option key={c} value={c}>{CONTACT_SHARE_CATEGORIES[c]}</option>)}
        </select>
      </div>
      {!preview && (
        <Button size="sm" variant="secondary" onClick={() => run(true)} disabled={busy} data-testid="preview-message">
          <Eye aria-hidden /> Preview message
        </Button>
      )}
      {preview && (
        <div className="space-y-2">
          <blockquote className="rounded-xl border border-line bg-surface p-3 text-sm text-ink-soft" data-testid="message-preview">{preview.preview}</blockquote>
          {preview.decision.allowed ? (
            <p className="text-xs text-sage-700">Permitted by your settings.</p>
          ) : (
            <p className="text-xs text-safety-700" data-testid="blocked-reason">Can't be sent: {preview.decision.reason}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run(false)} disabled={busy} data-testid="send-message">
              <Send aria-hidden /> Send (simulated)
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
      {result && <p className="text-sm text-ink-soft" role="status" data-testid="notify-result">{result}</p>}
    </div>
  );
}
