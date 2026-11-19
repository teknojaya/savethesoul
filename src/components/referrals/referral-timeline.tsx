import { Check } from "lucide-react";
import { STATUS_LABEL, type ReferralStatus } from "@/features/referrals/state-machine";
import { cn, formatDateTime } from "@/lib/utils";

const HAPPY_PATH: ReferralStatus[] = ["REQUESTED", "ACKNOWLEDGED", "SCHEDULED", "COMPLETED"];

export function ReferralTimeline({
  status,
  events,
}: {
  status: ReferralStatus;
  events: { id: string; toStatus: string; actorRole: string; note: string | null; createdAt: string }[];
}) {
  const reached = new Set(events.map((e) => e.toStatus));
  const exit = ["DECLINED", "CANCELLED", "UNABLE_TO_CONTACT"].includes(status) ? status : null;
  return (
    <div className="mt-4">
      <ol className="flex items-center gap-1" aria-label="Referral progress">
        {HAPPY_PATH.map((s, i) => {
          const done = reached.has(s);
          const current = status === s;
          return (
            <li key={s} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  done ? "bg-brand-600 text-white" : "bg-sand text-muted",
                  current && "ring-4 ring-brand-100",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("hidden text-xs sm:inline", done ? "text-ink" : "text-muted")}>{STATUS_LABEL[s]}</span>
              {i < HAPPY_PATH.length - 1 && <span className={cn("h-0.5 flex-1 rounded", done ? "bg-brand-200" : "bg-line")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      {exit && <p className="mt-2 text-sm font-medium text-amber-700">{STATUS_LABEL[exit as ReferralStatus]}</p>}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">History ({events.length})</summary>
        <ul className="mt-1.5 space-y-1">
          {events.map((e) => (
            <li key={e.id}>
              {formatDateTime(e.createdAt)} — {STATUS_LABEL[e.toStatus as ReferralStatus]} by {e.actorRole.toLowerCase()}
              {e.note ? ` · ${e.note}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
