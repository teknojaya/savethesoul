import { route } from "@/lib/http";

export const GET = route({}, async ({ actor }) => ({
  user: { id: actor.userId, role: actor.role, displayName: actor.displayName, isDemo: actor.isDemo },
}));
