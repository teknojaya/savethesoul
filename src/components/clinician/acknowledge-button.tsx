"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function AcknowledgeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="safety"
      disabled={busy}
      data-testid="acknowledge-alert"
      onClick={async () => {
        setBusy(true);
        await api(`/api/safety/events/${id}/acknowledge`, { method: "POST" }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy && <Loader2 className="animate-spin" aria-hidden />} Acknowledge
    </Button>
  );
}
