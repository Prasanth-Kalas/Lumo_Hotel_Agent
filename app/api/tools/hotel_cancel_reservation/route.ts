/**
 * hotel_cancel_reservation — Saga rollback tool.
 *
 * The compound-booking orchestrator invokes this when a later leg of
 * a multi-step trip fails and we need to reverse earlier commits. No
 * human-in-the-loop confirmation (the Saga decides), no payment
 * implications (the stub refunds immediately; a real Amadeus
 * integration would use their order-cancel endpoint).
 *
 * Idempotent: calling it twice returns 200 with
 * `already_cancelled: true` the second time. The shell's Saga relies
 * on this — it may retry cancellations on transient failures.
 */

import { z } from "zod";
import { cancelReservation } from "@/lib/amadeus";
import { badRequestFromZod, errorResponse, stripEnvelopeKeys } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    reservation_id: z.string().regex(/^res_htl_[a-z0-9]+$/),
    reason: z.string().max(300).optional(),
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

  const result = cancelReservation(parsed.data.reservation_id);

  if (!result.ok) {
    return errorResponse(
      "reservation_not_found",
      404,
      `Reservation not found: ${parsed.data.reservation_id}`,
    );
  }

  return Response.json(
    { reservation: result.reservation, already_cancelled: result.already_cancelled },
    { headers: { "Cache-Control": "no-store" } },
  );
}
