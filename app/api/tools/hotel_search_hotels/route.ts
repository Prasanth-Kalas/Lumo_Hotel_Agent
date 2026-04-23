/**
 * hotel_search_hotels — free-tier discovery tool.
 *
 * Returns hotels matching free-text city + filters, cheapest-first. No
 * PII required, no confirmation gate. Safe for the orchestrator to call
 * whenever the user wants to browse.
 */

import { z } from "zod";
import { searchHotels } from "@/lib/amadeus";
import { badRequestFromZod, errorResponse, stripEnvelopeKeys } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HotelAmenitySchema = z.enum([
  "wifi",
  "pool",
  "gym",
  "spa",
  "parking",
  "breakfast",
  "pet_friendly",
  "bar",
  "restaurant",
  "ev_charging",
  "airport_shuttle",
]);

const BodySchema = z
  .object({
    city: z.string().min(2).max(80).optional(),
    min_star_rating: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
    max_nightly_rate: z.number().positive().max(100000).optional(),
    amenities: z.array(HotelAmenitySchema).max(11).optional(),
    pet_friendly: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse("bad_request", 400, "Request body must be JSON.");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return errorResponse("bad_request", 400, "Request body must be a JSON object.");
  }

  const stripped = stripEnvelopeKeys(raw as Record<string, unknown>);
  const parsed = BodySchema.safeParse(stripped);
  if (!parsed.success) return badRequestFromZod(parsed.error);

  const results = await searchHotels(parsed.data);

  return Response.json(
    { hotels: results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
