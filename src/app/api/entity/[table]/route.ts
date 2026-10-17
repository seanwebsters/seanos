import { getDb } from "@/lib/db";
import type { TableName } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { ENTITIES } from "@/lib/services/entities";

export const POST = route(async (req: Request, { params }: { params: Promise<{ table: string }> }) => {
  const { table } = await params;
  const spec = ENTITIES[table as TableName];
  if (!spec?.create) throw new HttpError(404, "Not creatable");
  const row = spec.create(await body(req));
  await getDb().insert(table as TableName, row as never);
  return json({ row });
});
