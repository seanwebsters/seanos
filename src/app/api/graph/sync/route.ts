import { json, route } from "@/lib/api";
import { syncGraph } from "@/lib/graph/workflows";

export const POST = route(async () => json({ result: await syncGraph(true) }));
