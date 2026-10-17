import { readFile } from "@/lib/integrations/storage";
import { route, HttpError } from "@/lib/api";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const f = await readFile(id);
  if (!f) throw new HttpError(404, "Not found");
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=31536000, immutable" } });
});
