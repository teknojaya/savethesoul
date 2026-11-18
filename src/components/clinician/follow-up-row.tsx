"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

export function FollowUpRow({ f }: { f: { id: string; patientId: string; patientName: string; scheduledFor: string; status: string; functioningChange: number | null } }) {
  const router = useRouter();
  const [change, setChange] = useState<number>(f.functioningChange ?? 0);
  const [busy, setBusy] = useState<string | null>(null);

  async function update(status: "COMPLETED" | "MISSED" | "CANCELLED") {
    setBusy(status);
    await api(`/api/clinician/follow-ups/${f.id}`, { method: "PATCH", body: { status, functioningChange: status === "COMPLETED" ? change : null } }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="follow-up-row">
      <div className="min-w-0 flex-1">
        <Link href={`/clinician/patients/${f.patientId}`} className="font-semibold text-ink hover:underline">{f.patientName}</Link>
        <p className="text-xs text-muted">{formatDateTime(f.scheduledFor)}</p>
      </div>
      <Badge tone={f.status === "COMPLETED" ? "sage" : f.status === "PLANNED" ? "sky" : "neutral"}>{f.status.toLowerCase()}</Badge>
      {f.functioningChange !== null && <Badge tone="outline">Functioning {f.functioningChange > 0 ? "+" : ""}{f.functioningChange}</Badge>}
      {f.status === "PLANNED" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Functioning change
            <select className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink" value={change} onChange={(e) => setChange(Number(e.target.value))}>
              {[-2, -1, 0, 1, 2].map((n) => <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={() => update("COMPLETED")} disabled={!!busy} data-testid="complete-follow-up">
            {busy === "COMPLETED" && <Loader2 className="animate-spin" aria-hidden />} Completed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update("MISSED")} disabled={!!busy}>Missed</Button>
        </div>
      )}
    </Card>
  );
}
