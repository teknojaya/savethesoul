import { route } from "@/lib/http";
import { listSupportResources } from "@/server/services/resource.service";

export const GET = route({ public: true }, async () => ({ resources: await listSupportResources() }));
