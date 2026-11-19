import { requirePatientPage } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/ui/primitives";
import { ExploreFlow } from "./explore-flow";

export const metadata = { title: "Explore My Mental Wellbeing" };

export default async function ExplorePage() {
  const actor = await requirePatientPage();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI-assisted · preliminary"
        title="Explore My Mental Wellbeing"
        description="A few structured questions, combined with your own WHO-5 results and check-ins, to help you understand what you're going through and what to bring to a professional. This is not a diagnosis."
      />
      <ExploreFlow name={actor.displayName} />
    </div>
  );
}
