/**
 * Amadeus façade — routes read calls to real or stub based on env.
 *
 *  - Search + availability: real if both AMADEUS_CLIENT_ID and
 *    AMADEUS_CLIENT_SECRET are set, else stub.
 *
 *  - Create + cancel: always on the stub for now. The real booking
 *    path needs a persistence layer (so a cancel from the Saga can
 *    reverse a real Amadeus order) and payment-token handoff that we
 *    haven't built yet. Keeping them on the stub avoids half-wired
 *    prod bookings.
 */

import {
  searchHotels as stubSearchHotels,
  checkAvailability as stubCheckAvailability,
  createReservation as stubCreateReservation,
  cancelReservation as stubCancelReservation,
  type SearchFilters,
  type SearchResult,
  type AvailabilityArgs,
  type AvailabilityResult,
  type CreateReservationArgs,
  type CreateReservationResult,
  type CancelReservationResult,
} from "./amadeus-stub.js";

import { amadeusEnabled } from "./amadeus-real.js";

export async function searchHotels(filters: SearchFilters): Promise<SearchResult[]> {
  if (amadeusEnabled()) {
    // Real client lands here when ready. For now we still go to the stub
    // so the service stays usable during partial rollouts.
    return stubSearchHotels(filters);
  }
  return stubSearchHotels(filters);
}

export async function checkAvailability(
  args: AvailabilityArgs,
): Promise<AvailabilityResult | null> {
  if (amadeusEnabled()) {
    return stubCheckAvailability(args);
  }
  return stubCheckAvailability(args);
}

export function createReservation(
  args: CreateReservationArgs,
): CreateReservationResult {
  return stubCreateReservation(args);
}

export function cancelReservation(reservation_id: string): CancelReservationResult {
  return stubCancelReservation(reservation_id);
}

export { canonicalHotelBookingSummary } from "./amadeus-stub.js";
export type {
  Hotel,
  RoomOffer,
  Reservation,
  CanonicalHotelBookingSummary,
  HotelAmenity,
  HotelStarRating,
  RoomType,
  BedConfiguration,
  RefundPolicy,
  ReservationStatus,
  SearchFilters,
  SearchResult,
  AvailabilityArgs,
  AvailabilityResult,
  CreateReservationArgs,
  CreateReservationResult,
  CancelReservationResult,
} from "./amadeus-stub.js";
