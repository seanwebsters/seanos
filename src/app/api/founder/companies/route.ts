import { json, route, HttpError } from "@/lib/api";
import { BlockedError } from "@/lib/ai/errors";
import { searchCompanies } from "@/lib/integrations/companies-house";
import { rateLimit } from "@/lib/rate-limit";

export const GET = route(async (req: Request) => {
  rateLimit("founder:ch", 20, 60_000);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) throw new HttpError(400, "Search for a name");
  try {
    return json({ items: await searchCompanies(q), source: "Companies House (live)" });
  } catch (e) {
    if (e instanceof BlockedError) throw new HttpError(412, e.message);
    throw e;
  }
});
