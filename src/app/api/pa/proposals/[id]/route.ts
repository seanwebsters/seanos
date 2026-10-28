import { body, HttpError, json, route } from "@/lib/api";
import { decideProposal } from "@/lib/pa/assistant";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ decision?: string }>(req);
  if (b.decision !== "approve" && b.decision !== "reject") throw new HttpError(400, "Approve or reject");
  return json(await decideProposal(id, b.decision));
});
