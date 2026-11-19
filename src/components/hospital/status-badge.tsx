import { Badge } from "@/components/ui/primitives";
import { STATUS_LABEL, type EmergencyStatus } from "@/features/emergency/state-machine";

/** Red only for cases genuinely awaiting human action; never implies a real dispatch. */
export function EmergencyStatusBadge({ status }: { status: EmergencyStatus }) {
  const tone =
    status === "REVIEW_REQUESTED" || status === "DETECTED"
      ? "safety"
      : status === "RESOLVED"
        ? "sage"
        : status === "FAILED" || status === "UNABLE_TO_CONTACT" || status === "CANCELLED"
          ? "amber"
          : "brand";
  return (
    <Badge tone={tone} data-testid="case-status">
      {STATUS_LABEL[status]}
    </Badge>
  );
}
