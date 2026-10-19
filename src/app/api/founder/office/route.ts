import { json, route } from "@/lib/api";
import { officeState } from "@/lib/founder/office";

export const GET = route(async () => json(await officeState()));
