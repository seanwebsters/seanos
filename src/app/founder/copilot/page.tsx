import { PageHeader } from "@/components/ui";
import { CopilotChat } from "@/components/founder";

export default function CopilotPage() {
  return (
    <div className="pb-10">
      <PageHeader back="/founder" eyebrow="Founder OS" title="AI Cofounder" subtitle="Talk it through. It can add tasks, adjust models, record decisions and start agent work. It can't send, spend or sign anything." />
      <div className="card mx-5 mt-4 flex flex-col overflow-hidden lg:mx-0">
        <CopilotChat tall suggestions={["Which of my ventures has the best chance with the least time?", "Build the business for Webster", "Rank my ventures", "What should I stop working on?"]} />
      </div>
    </div>
  );
}
