/**
 * hotel_create_reservation — the money tool.
 *
 * Two gates before we commit a booking:
 *
 *   (A) Offer exists and hasn't expired (15-min TTL).
 *       Enforced by the stub's createReservation() — returns 410 on
 *       expired, 404 on unknown.
 *
 *   (B) The client-supplied summary_hash matches the server's
 *       re-computed hash over the canonical booking summary.
 *       Enforced here before we call createReservation() so a hash
 *       mismatch never charges anyone. A mismatch returns 409
 *       `confirmation_required`, and the shell re-renders the
 *       BookingConfirmationCard from fresh data.
 *
 * Idempotency: an `x-idempotency-key` header (8–128 chars) makes
 * repeat calls return the existing reservation instead of issuing a
 * duplicate. Matches the Flight + Restaurant Agent convention.
 */

import { z } from "zod";
import { hashSummary } from "@lumo/agent-sdk";
import {
  canonicalHotelBookingSummary,
  createReservation,
} from "@/lib/amadeus";
import { CATALOG } from "@/lib/amadeus-stub";
import { badRequestFromZod, errorResponse, stripEnvelopeKeys } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    offer_id: z.string().min(8),
    guest_name: z.string().min(2).max(100),
    guest_email: z.string().email(),
    guest_count: z.number().int().min(1).max(8),
    payment_token: z.string().min(4).max(256).optional(),
    summary_hash: z.string().regex(/^[a-f0-9]{64}$/),
    user_confirmed: z.literal(true),
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

  const idempotency_key = req.headers.get("x-idempotency-key") ?? undefined;
  if (idempotency_key !== undefined && (idempotency_key.length < 8 || idempotency_key.length > 128)) {
    return errorResponse(
      "bad_request",
      400,
      "x-idempotency-key header must be 8–128 characters when present.",
    );
  }

  // ── Gate B: hash-match against the canonical summary the user saw.
  // We need the offer + hotel to compute the expected hash. Peek into
  // the stub directly to avoid booking and then rolling back on mismatch.
  const { __peekOffer } = await import("@/lib/amadeus-stub-peek");
  const offer = __peekOffer(parsed.data.offer_id);
  if (!offer) {
    return errorResponse(
      "offer_not_found",
      404,
      `Offer not found or already booked: ${parsed.data.offer_id}`,
    );
  }
  if (Date.parse(offer.expires_at) < Date.now()) {
    return errorResponse(
      "offer_expired",
      410,
      "Offer expired. Call hotel_check_availability again and re-present to the user.",
    );
  }
  const hotel = CATALOG.find((h) => h.hotel_id === offer.hotel_id) ?? null;
  if (!hotel) {
    // Catalog drift — should never happen in stub mode, would indicate
    // a real Amadeus offer pointing at a hotel we don't have details for.
    return errorResponse(
      "hotel_not_found",
      404,
      `Hotel backing this offer is not in the catalog: ${offer.hotel_id}`,
    );
  }

  const parts = offer.offer_id.split(":");
  const check_in_date = parts[2] ?? "";
  const check_out_date = parts[3] ?? "";

  const expectedSummary = canonicalHotelBookingSummary({
    hotel,
    offer,
    check_in_date,
    check_out_date,
    guest_count: parsed.data.guest_count,
    guest_name: parsed.data.guest_name,
  });
  const expectedHash = hashSummary(expectedSummary);

  if (expectedHash !== parsed.data.summary_hash) {
    return errorResponse(
      "confirmation_required",
      409,
      "summary_hash does not match the canonical booking summary. Re-render BookingConfirmationCard and retry.",
      { expected_hash: expectedHash },
    );
  }

  // ── Commit.
  const result = createReservation({
    offer_id: parsed.data.offer_id,
    guest_name: parsed.data.guest_name,
    guest_email: parsed.data.guest_email,
    guest_count: parsed.data.guest_count,
    idempotency_key,
    payment_token: parsed.data.payment_token,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "offer_not_found":
        return errorResponse("offer_not_found", 404, "Offer not found.");
      case "offer_expired":
        return errorResponse(
          "offer_expired",
          410,
          "Offer expired between hash-check and commit. Retry.",
        );
      case "hotel_not_found":
        return errorResponse("hotel_not_found", 404, "Hotel not in catalog.");
      case "payment_required":
        return errorResponse(
          "payment_required",
          402,
          "This offer requires a deposit. Route the user through the PCI collector and retry with a payment_token.",
        );
    }
  }

  return Response.json(result.reservation, {
    headers: { "Cache-Control": "no-store" },
  });
}
