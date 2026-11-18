import { route } from "@/lib/http";
import { listShareableClinicians } from "@/server/services/summary.service";

/** Directory of (synthetic) clinicians a patient may choose to share with. */
export const GET = route({ roles: ["PATIENT"] }, async () => ({
  clinicians: await listShareableClinicians(),
}));
