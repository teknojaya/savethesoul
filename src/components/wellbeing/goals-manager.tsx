"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function GoalsManager({ goals }: { goals: { id: string; title: string; status: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await api("/api/wellbeing/goals", { body: { title } }).catch(() => null);
    setTitle("");
    setBusy(false);
    router.refresh();
  }

  async function update(id: string, status: "ACHIEVED" | "ARCHIVED" | "ACTIVE") {
    await api(`/api/wellbeing/goals/${id}`, { method: "PATCH", body: { status } }).catch(() => null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {goals.map((g) => (
          <li key={g.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", g.status === "ACHIEVED" ? "border-sage-100 bg-sage-50" : "border-line")}>
            <span className={cn("flex-1", g.status === "ACHIEVED" && "text-sage-700 line-through decoration-sage-300")}>{g.title}</span>
            {g.status === "ACTIVE" ? (
              <button onClick={() => update(g.id, "ACHIEVED")} className="rounded-lg p-1.5 text-muted hover:bg-sage-50 hover:text-sage-700" aria-label={`Mark "${g.title}" achieved`}>
                <Check className="size-4" />
              </button>
            ) : null}
            <button onClick={() => update(g.id, "ARCHIVED")} className="rounded-lg p-1.5 text-muted hover:bg-sand" aria-label={`Archive "${g.title}"`}>
              <Archive className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="goal" className="sr-only">New goal</label>
        <Input id="goal" placeholder="e.g. Walk 15 minutes after lunch" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" variant="soft" disabled={busy || !title.trim()}>
          <Plus aria-hidden /> Add
        </Button>
      </form>
    </div>
  );
}
