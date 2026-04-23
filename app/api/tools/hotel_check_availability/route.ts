/**
 * hotel_check_availability — low-cost pricing tool.
 *
 * Issues short-lived (15-minute TTL) room offers for a (hotel, dates,
 * party) triple. The returned offers are the ONLY inputs
 * hotel_create_reservation will accept — the offer_id carries the
 * stay dates and is verified server-side at book time.
 */

import { z } from "zod";
import { checkAvailability } from "@/lib/amadeus";
import { badRequestFromZod, errorResponse, stripEnvelopeKeys } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    hotel_id: z.string().regex(/^htl_[a-z0-9_]+$/),
    check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    guest_count: z.number().int().min(1).max(8),
  })
  .strict()
  .refine(
    (v) => Date.parse(`${v.check_out_date}T00:00:00Z`) > Date.parse(`${v.check_in_date}T00:00:00Z`),
    { message: "check_out_date must be strictly after check_in_date" },
  );

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

  const result = await checkAvailability(parsed.data);
  if (!result) {
    return errorResponse(
      "hotel_not_found",
      404,
      `Hotel not found: ${parsed.data.hotel_id}`,
    );
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
