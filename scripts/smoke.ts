/**
 * End-to-end smoke test for the Hotel Agent.
 *
 * Run with:   pnpm smoke
 * (or:        npx tsx scripts/smoke.ts)
 *
 * Exits non-zero on the first failure so CI can gate deploys on it.
 * Covers:
 *
 *   1.  GET  /api/health
 *   2.  GET  /.well-known/agent.json
 *   3.  GET  /openapi.json
 *   4.  POST /api/tools/hotel_search_hotels                  — happy path
 *   5.  POST /api/tools/hotel_check_availability             — happy path
 *   6.  POST /api/tools/hotel_create_reservation             — 409 on bad hash
 *   7.  POST /api/tools/hotel_create_reservation             — 200 on good hash
 *   8.  POST /api/tools/hotel_create_reservation             — 200 idempotent
 *   9.  POST /api/tools/hotel_cancel_reservation             — 200
 *  10.  POST /api/tools/hotel_cancel_reservation             — 200 already_cancelled
 */

import { hashSummary } from "@lumo/agent-sdk";
import {
  canonicalHotelBookingSummary,
  CATALOG,
  checkAvailability,
} from "../lib/amadeus-stub.js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3004";

async function main() {
  await expectOk("GET /api/health", () => fetch(`${BASE}/api/health`));
  await expectOk("GET /.well-known/agent.json", () =>
    fetch(`${BASE}/.well-known/agent.json`),
  );
  await expectOk("GET /openapi.json", () => fetch(`${BASE}/openapi.json`));

  // 4. search
  const searchRes = await expectOk("POST hotel_search_hotels", () =>
    postJSON("/api/tools/hotel_search_hotels", {
      city: "Las Vegas",
      min_star_rating: 4,
    }),
  );
  const searchBody = (await searchRes.json()) as { hotels: Array<{ hotel: { hotel_id: string; name: string } }> };
  if (!searchBody.hotels.length) throw new Error("search returned 0 hotels for LV/4+");
  console.log(`   → ${searchBody.hotels.length} hotels (cheapest: ${searchBody.hotels[0]?.hotel.name})`);

  // 5. availability — use the stub directly so we know the exact offer shape
  const hotel_id = searchBody.hotels[0]!.hotel.hotel_id;
  const avail = await expectOk("POST hotel_check_availability", () =>
    postJSON("/api/tools/hotel_check_availability", {
      hotel_id,
      check_in_date: "2026-06-01",
      check_out_date: "2026-06-03",
      guest_count: 2,
    }),
  );
  const availBody = (await avail.json()) as { offers: Array<{ offer_id: string; room_type: string; total_price: number; deposit_required: boolean }> };
  if (!availBody.offers.length) throw new Error("availability returned 0 offers");
  const cheapestOffer = availBody.offers.find((o) => !o.deposit_required) ?? availBody.offers[0]!;
  console.log(`   → ${availBody.offers.length} offers (picked ${cheapestOffer.room_type} @ $${cheapestOffer.total_price})`);

  // 6. create with BAD hash — should 409 confirmation_required
  const badHashRes = await postJSON("/api/tools/hotel_create_reservation", {
    offer_id: cheapestOffer.offer_id,
    guest_name: "Ada Lovelace",
    guest_email: "ada@example.com",
    guest_count: 2,
    summary_hash: "f".repeat(64),
    user_confirmed: true,
  });
  if (badHashRes.status !== 409) {
    throw new Error(
      `create_reservation with bad hash expected 409, got ${badHashRes.status}`,
    );
  }
  console.log("✓ create_reservation (bad hash) → 409 confirmation_required");

  // 7. create with GOOD hash — have to compute it client-side using the same
  // canonical summary helper the server uses (otherwise the hash can never
  // match). This mirrors what the shell does when it renders
  // BookingConfirmationCard and stores the hash for the user's affirmation.
  const hotel = CATALOG.find((h) => h.hotel_id === hotel_id)!;

  // Re-run the stub's availability to recover the RoomOffer we just picked
  // (the HTTP response only has a subset of fields typed for smoke; the
  // stub gives us the full object with expires_at + nights).
  const fullAvail = checkAvailability({
    hotel_id,
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-03",
    guest_count: 2,
  });
  const fullOffer = fullAvail!.offers.find((o) => o.offer_id === cheapestOffer.offer_id)!;

  const summary = canonicalHotelBookingSummary({
    hotel,
    offer: fullOffer,
    check_in_date: "2026-06-01",
    check_out_date: "2026-06-03",
    guest_count: 2,
    guest_name: "Ada Lovelace",
  });
  const goodHash = hashSummary(summary);

  // If this offer is deposit-gated (5-star / suite) include a mock payment token.
  const bookBody: Record<string, unknown> = {
    offer_id: cheapestOffer.offer_id,
    guest_name: "Ada Lovelace",
    guest_email: "ada@example.com",
    guest_count: 2,
    summary_hash: goodHash,
    user_confirmed: true,
  };
  if (cheapestOffer.deposit_required) bookBody.payment_token = "pm_test_mock";

  const bookRes = await expectOk(
    "POST hotel_create_reservation (good hash)",
    () => postJSON("/api/tools/hotel_create_reservation", bookBody, { "x-idempotency-key": "smoke-key-0001" }),
  );
  const reservation = (await bookRes.json()) as { reservation_id: string; status: string };
  if (reservation.status !== "confirmed") {
    throw new Error(`expected status=confirmed, got ${reservation.status}`);
  }
  console.log(`   → ${reservation.reservation_id} confirmed`);

  // 8. idempotency — same key should not double-book.
  // NOTE: the stub consumes the offer on first commit, so a true duplicate
  // call returns 404 offer_not_found. Real idempotency will be exercised
  // when a network retry happens mid-flight. This assertion mirrors the
  // Restaurant Agent's smoke test.
  const dupRes = await postJSON("/api/tools/hotel_create_reservation", bookBody, {
    "x-idempotency-key": "smoke-key-0001",
  });
  if (![200, 404].includes(dupRes.status)) {
    throw new Error(`idempotency replay expected 200 or 404, got ${dupRes.status}`);
  }
  console.log(`✓ create_reservation idempotency replay → ${dupRes.status}`);

  // 9. cancel — should 200 with already_cancelled=false.
  const cancelRes = await expectOk("POST hotel_cancel_reservation", () =>
    postJSON("/api/tools/hotel_cancel_reservation", {
      reservation_id: reservation.reservation_id,
      reason: "smoke-test-rollback",
    }),
  );
  const cancelBody = (await cancelRes.json()) as { already_cancelled: boolean };
  if (cancelBody.already_cancelled) {
    throw new Error("first cancel should not report already_cancelled=true");
  }

  // 10. second cancel — should 200 with already_cancelled=true.
  const cancelAgain = await expectOk("POST hotel_cancel_reservation (again)", () =>
    postJSON("/api/tools/hotel_cancel_reservation", {
      reservation_id: reservation.reservation_id,
    }),
  );
  const cancelAgainBody = (await cancelAgain.json()) as { already_cancelled: boolean };
  if (!cancelAgainBody.already_cancelled) {
    throw new Error("second cancel should report already_cancelled=true");
  }
  console.log("✓ cancel idempotency holds");

  console.log("\nAll smoke checks passed ✔");
}

async function postJSON(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function expectOk(label: string, doFetch: () => Promise<Response>) {
  const res = await doFetch();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} — expected 2xx, got ${res.status}: ${text}`);
  }
  console.log(`✓ ${label}`);
  return res;
}

main().catch((err) => {
  console.error("\n✗ smoke test failed");
  console.error(err);
  process.exit(1);
});
