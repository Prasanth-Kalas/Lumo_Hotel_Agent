/**
 * Canonical agent manifest.
 *
 * The Lumo shell fetches this at registry boot (and on every deploy
 * webhook) to validate the agent is still contract-compatible. Built at
 * request time so PUBLIC_BASE_URL/VERCEL_URL can change without a
 * rebuild (Vercel preview URLs, staging overlays, etc.).
 */

import { buildManifest } from "@/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const manifest = buildManifest();
  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
