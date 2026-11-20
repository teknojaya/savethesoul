import { requirePatientPage } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/ui/primitives";
import { InsightsView } from "./insights-view";

export const metadata = { title: "My Clinical Insights" };

export default async function InsightsPage() {
  await requirePatientPage();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sakinah Clinical Intelligence"
        title="My Clinical Insights"
        description="With your permission, Sakinah organises what you share in conversations, together with your WHO-5 results and check-ins, into preliminary insights for you to review. They are not a diagnosis, and nothing is shared with a clinician unless you choose to."
      />
      <InsightsView />
    </div>
  );
}
