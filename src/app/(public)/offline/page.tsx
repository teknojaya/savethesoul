import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmergencyContacts } from "@/components/safety/emergency-contacts";

export const metadata: Metadata = { title: "You're offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-sand text-ink-soft">
        <WifiOff className="size-6" aria-hidden />
      </div>
      <h1 className="font-display text-3xl text-ink">You're offline</h1>
      <p className="mt-2 text-ink-soft">
        SaveTheSoul needs a connection for the companion and your records. Emergency numbers still work from your phone:
      </p>
      <div className="mt-6">
        <EmergencyContacts compact />
      </div>
    </div>
  );
}
