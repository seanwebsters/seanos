import { body, HttpError, json, route } from "@/lib/api";
import { anotherTime } from "@/lib/pa/assistant";

export const POST = route(async (req: Request) => {
  const b = await body<{ message_id?: string }>(req);
  if (!b.message_id) throw new HttpError(400, "Which suggestion?");
  return json({ message: await anotherTime(b.message_id) });
});
