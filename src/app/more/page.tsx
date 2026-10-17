import { PageHeader } from "@/components/ui";
import { MoreGrid } from "@/components/client";

export default function More() {
  return (
    <div>
      <PageHeader title="Everything" />
      <div className="mt-3"><MoreGrid /></div>
    </div>
  );
}
