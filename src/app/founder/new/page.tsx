import { PageHeader } from "@/components/ui";
import { NewVentureForm } from "@/components/founder";

export default function NewVenture() {
  return (
    <div className="pb-10">
      <PageHeader back="/founder" eyebrow="Idea to business" title="New venture" subtitle="Describe it however roughly. Your team turns it into a strategy, model, funding plan, investor shortlist and 90-day plan." />
      <div className="mt-4"><NewVentureForm /></div>
    </div>
  );
}
