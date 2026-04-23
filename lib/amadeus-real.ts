/**
 * Amadeus Self-Service Hotel Search/Booking — real client (placeholder).
 *
 * Amadeus ships a self-serve test API at test.api.amadeus.com that
 * requires no partner onboarding; once the team is comfortable, the
 * same OAuth2 client-credentials flow works against api.amadeus.com in
 * production. So this file is deliberately a stub that throws —
 * replacing it is a drop-in change gated by the façade in
 * `lib/amadeus.ts`.
 *
 * Recommended endpoints to wire when we move off the mock:
 *
 *  1. POST /v1/security/oauth2/token           — get bearer token
 *  2. GET  /v1/reference-data/locations/hotels — resolve city → hotel list
 *  3. GET  /v3/shopping/hotel-offers           — availability + pricing
 *  4. POST /v3/booking/hotel-orders            — book
 *  5. DELETE /v3/booking/hotel-orders/{id}     — cancel
 *
 * Keep the return shapes identical to the stub's — `Hotel`, `RoomOffer`,
 * `Reservation` — so tool routes stay untouched when we flip the switch.
 */

export function amadeusEnabled(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

export async function searchHotelsReal(): Promise<never> {
  throw new Error(
    "Amadeus real client not yet implemented. Unset AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET to fall back to the mock stub.",
  );
}

export async function checkAvailabilityReal(): Promise<never> {
  throw new Error(
    "Amadeus real client not yet implemented. Unset AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET to fall back to the mock stub.",
  );
}
