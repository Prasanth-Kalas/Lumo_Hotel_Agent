/**
 * Liveness probe for the Lumo shell's health poller + Vercel's status page.
 *
 * Intentionally cheap — no downstream calls. If the process is up enough
 * to serve this, we call it healthy. Deeper readiness (e.g. Amadeus
 * reachability) would go on a separate `/api/ready` if we ever need it.
 */

import { amadeusEnabled } from "@/lib/amadeus-real";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: "ok",
      agent_id: "hotel",
      version: "0.1.0",
      mode: amadeusEnabled() ? "real" : "mock",
      ts: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
