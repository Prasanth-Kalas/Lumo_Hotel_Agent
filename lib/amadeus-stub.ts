/**
 * Amadeus Self-Service Hotel Search/Booking stub.
 *
 * In-memory implementation of the search → availability → book → cancel
 * loop. Mirrors the Flight Agent's Duffel stub and the Restaurant Agent's
 * OpenTable stub so the three specialists look the same to the
 * orchestrator shell.
 *
 * Philosophy (same as its siblings):
 *
 *  - Deterministic. Given the same (hotel_id, check_in, check_out,
 *    guests), `checkAvailability()` always returns the same offers in the
 *    same order. Reproducible demos, no flakey CI.
 *
 *  - TTL'd. Each offer has a 15-minute wall-clock lifetime. After that,
 *    booking the offer returns 410 `offer_expired`, forcing a fresh
 *    availability check. Matches real partner-API behavior where rates
 *    don't survive the checkout page indefinitely.
 *
 *  - Hash-gated. `canonicalHotelBookingSummary()` is the ONLY source of
 *    truth for what the user confirmed. Both the shell and the server
 *    re-compute `sha256` over it; a mismatch returns 409
 *    `confirmation_required`. The field list is append-only — any change
 *    invalidates every in-flight confirmation across the system.
 *
 *  - Swap-ready. `lib/amadeus.ts` is the façade that routes to this stub
 *    or to `lib/amadeus-real.ts` based on whether AMADEUS_CLIENT_ID +
 *    AMADEUS_CLIENT_SECRET are set. Amadeus ships a self-serve test API
 *    that needs no partner review, so the real path can go live faster
 *    than Duffel or OpenTable did.
 */

import { hashSummary } from "@lumo/agent-sdk";

// ──────────────────────────────────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────────────────────────────────

export type HotelStarRating = 3 | 4 | 5;

export type HotelAmenity =
  | "wifi"
  | "pool"
  | "gym"
  | "spa"
  | "parking"
  | "breakfast"
  | "pet_friendly"
  | "bar"
  | "restaurant"
  | "ev_charging"
  | "airport_shuttle";

export interface Hotel {
  hotel_id: string;
  name: string;
  brand: string | null;
  city: string;
  /** ISO-3166-2 state/region, e.g. "CA", "NY", "NV", "TX". */
  region: string;
  country: string;
  address_line: string;
  star_rating: HotelStarRating;
  guest_score: number; // 0–10, Booking.com-style
  amenities: HotelAmenity[];
  latitude: number;
  longitude: number;
  /** Short editorial blurb for the assistant to quote. */
  description: string;
}

export type RoomType =
  | "standard_queen"
  | "standard_king"
  | "deluxe_king"
  | "suite"
  | "twin_double"
  | "family_room";

export type BedConfiguration =
  | "1 queen"
  | "1 king"
  | "2 double"
  | "2 queen"
  | "1 king + sofa bed";

export type RefundPolicy =
  | "fully_refundable_until_24h"
  | "fully_refundable_until_72h"
  | "non_refundable";

export interface RoomOffer {
  /** Composite offer id: `${hotel_id}:${room_type}:${check_in}:${check_out}:${offer_seq}`. */
  offer_id: string;
  hotel_id: string;
  room_type: RoomType;
  room_name: string;
  bed_configuration: BedConfiguration;
  max_occupancy: number;
  /** Total for the stay (all nights × base rate + taxes/fees). */
  total_price: number;
  /** Per-night base rate (before taxes/fees). */
  nightly_rate: number;
  currency: "USD";
  /** Number of nights = days between check_in and check_out. */
  nights: number;
  refund_policy: RefundPolicy;
  /** Whether this offer includes breakfast for the party. */
  breakfast_included: boolean;
  /** True when a deposit charge is required at booking (refundable later). */
  deposit_required: boolean;
  /** ISO timestamp after which this offer is rejected by create_reservation. */
  expires_at: string;
}

export type ReservationStatus = "confirmed" | "cancelled";

export interface Reservation {
  reservation_id: string;
  hotel_id: string;
  offer_id: string;
  room_type: RoomType;
  check_in_date: string; // YYYY-MM-DD
  check_out_date: string; // YYYY-MM-DD
  nights: number;
  guest_count: number;
  guest_name: string;
  guest_email: string;
  total_price: number;
  currency: "USD";
  status: ReservationStatus;
  created_at: string; // ISO
  cancelled_at: string | null; // ISO
  /** Echoed hash the server re-computed at book time. Handy for audit. */
  confirmation_hash: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Catalog — curated fixture across Lumo's launch markets
// ──────────────────────────────────────────────────────────────────────────

export const CATALOG: Hotel[] = [
  // ── San Francisco ────────────────────────────────────────────────────
  {
    hotel_id: "htl_sf_marker",
    name: "The Marker San Francisco",
    brand: "JdV by Hyatt",
    city: "San Francisco",
    region: "CA",
    country: "US",
    address_line: "501 Geary St, San Francisco, CA 94102",
    star_rating: 4,
    guest_score: 8.4,
    amenities: ["wifi", "gym", "bar", "restaurant", "pet_friendly"],
    latitude: 37.7873,
    longitude: -122.4104,
    description:
      "Boutique Beaux-Arts hotel one block from Union Square, walkable to cable cars and the theatre district.",
  },
  {
    hotel_id: "htl_sf_fairmont",
    name: "Fairmont San Francisco",
    brand: "Fairmont",
    city: "San Francisco",
    region: "CA",
    country: "US",
    address_line: "950 Mason St, San Francisco, CA 94108",
    star_rating: 5,
    guest_score: 8.8,
    amenities: ["wifi", "gym", "spa", "restaurant", "bar", "parking"],
    latitude: 37.7924,
    longitude: -122.4102,
    description:
      "Landmark 1907 hotel atop Nob Hill with sweeping city and bay views, next to Grace Cathedral.",
  },
  {
    hotel_id: "htl_sf_hotelzeppelin",
    name: "Hotel Zeppelin",
    brand: "Viceroy Urban Retreats",
    city: "San Francisco",
    region: "CA",
    country: "US",
    address_line: "545 Post St, San Francisco, CA 94102",
    star_rating: 3,
    guest_score: 7.9,
    amenities: ["wifi", "bar", "pet_friendly", "gym"],
    latitude: 37.7884,
    longitude: -122.4108,
    description:
      "Playful rock-and-roll themed hotel steps from Union Square; solid budget-plus pick.",
  },

  // ── New York ─────────────────────────────────────────────────────────
  {
    hotel_id: "htl_nyc_thejane",
    name: "The Jane Hotel",
    brand: null,
    city: "New York",
    region: "NY",
    country: "US",
    address_line: "113 Jane St, New York, NY 10014",
    star_rating: 3,
    guest_score: 7.6,
    amenities: ["wifi", "bar", "restaurant"],
    latitude: 40.7378,
    longitude: -74.0087,
    description:
      "West Village landmark in a 1908 sailors' boarding house — compact cabins, famous Café Gitane breakfast.",
  },
  {
    hotel_id: "htl_nyc_fournyc",
    name: "The Four Seasons New York Downtown",
    brand: "Four Seasons",
    city: "New York",
    region: "NY",
    country: "US",
    address_line: "27 Barclay St, New York, NY 10007",
    star_rating: 5,
    guest_score: 9.2,
    amenities: ["wifi", "pool", "gym", "spa", "restaurant", "bar", "parking"],
    latitude: 40.7135,
    longitude: -74.0088,
    description:
      "Tribeca ultra-luxury tower, 75-foot indoor pool, Wolfgang Puck's CUT steakhouse, walk to World Trade Center.",
  },
  {
    hotel_id: "htl_nyc_aceny",
    name: "Ace Hotel New York",
    brand: "Ace",
    city: "New York",
    region: "NY",
    country: "US",
    address_line: "20 W 29th St, New York, NY 10001",
    star_rating: 4,
    guest_score: 8.1,
    amenities: ["wifi", "bar", "restaurant", "gym"],
    latitude: 40.7458,
    longitude: -73.9877,
    description:
      "NoMad anchor with lobby-bar buzz, Stumptown coffee off the lobby, easy access to Madison Square Park.",
  },

  // ── Las Vegas ────────────────────────────────────────────────────────
  {
    hotel_id: "htl_lv_bellagio",
    name: "Bellagio Las Vegas",
    brand: "MGM Resorts",
    city: "Las Vegas",
    region: "NV",
    country: "US",
    address_line: "3600 S Las Vegas Blvd, Las Vegas, NV 89109",
    star_rating: 5,
    guest_score: 8.7,
    amenities: [
      "wifi",
      "pool",
      "gym",
      "spa",
      "restaurant",
      "bar",
      "parking",
      "ev_charging",
    ],
    latitude: 36.1126,
    longitude: -115.1767,
    description:
      "Iconic Strip resort known for the fountains, Conservatory gardens, and a Michelin-starred restaurant roster.",
  },
  {
    hotel_id: "htl_lv_thepalazzo",
    name: "The Palazzo at The Venetian",
    brand: "Venetian Resort",
    city: "Las Vegas",
    region: "NV",
    country: "US",
    address_line: "3325 S Las Vegas Blvd, Las Vegas, NV 89109",
    star_rating: 5,
    guest_score: 8.9,
    amenities: [
      "wifi",
      "pool",
      "gym",
      "spa",
      "restaurant",
      "bar",
      "parking",
      "airport_shuttle",
    ],
    latitude: 36.1253,
    longitude: -115.1699,
    description:
      "All-suites high-rise connected to The Venetian, Grand Canal Shoppes, and the Sands Expo.",
  },
  {
    hotel_id: "htl_lv_downtowngrand",
    name: "Downtown Grand Hotel & Casino",
    brand: null,
    city: "Las Vegas",
    region: "NV",
    country: "US",
    address_line: "206 N 3rd St, Las Vegas, NV 89101",
    star_rating: 3,
    guest_score: 7.7,
    amenities: ["wifi", "pool", "bar", "restaurant", "parking"],
    latitude: 36.173,
    longitude: -115.1412,
    description:
      "Downtown Fremont-area hotel — cheaper than the Strip, walkable to Fremont Street Experience.",
  },

  // ── Austin ───────────────────────────────────────────────────────────
  {
    hotel_id: "htl_aus_drisk",
    name: "The Driskill",
    brand: "Hyatt Unbound Collection",
    city: "Austin",
    region: "TX",
    country: "US",
    address_line: "604 Brazos St, Austin, TX 78701",
    star_rating: 5,
    guest_score: 8.9,
    amenities: ["wifi", "gym", "restaurant", "bar", "parking", "pet_friendly"],
    latitude: 30.2687,
    longitude: -97.7421,
    description:
      "1886 Romanesque landmark two blocks from 6th Street — LBJ took his first date here, enough said.",
  },
  {
    hotel_id: "htl_aus_hotelsanjose",
    name: "Hotel San José",
    brand: "Bunkhouse",
    city: "Austin",
    region: "TX",
    country: "US",
    address_line: "1316 S Congress Ave, Austin, TX 78704",
    star_rating: 4,
    guest_score: 8.5,
    amenities: ["wifi", "pool", "bar", "pet_friendly", "breakfast"],
    latitude: 30.2496,
    longitude: -97.7498,
    description:
      "Quiet South Congress bungalow-style hotel; free breakfast basket delivered to your door.",
  },
];

// ──────────────────────────────────────────────────────────────────────────
// In-memory stores
// ──────────────────────────────────────────────────────────────────────────

const OFFER_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Offers issued by checkAvailability(), keyed by offer_id. */
const offerStore = new Map<string, RoomOffer>();
/** Reservations, keyed by reservation_id. */
const reservationStore = new Map<string, Reservation>();

// ──────────────────────────────────────────────────────────────────────────
// Search
// ──────────────────────────────────────────────────────────────────────────

export interface SearchFilters {
  /** Free-text; matches city case-insensitively. */
  city?: string;
  min_star_rating?: HotelStarRating;
  /** Nightly budget cap — hotels with cheapest nightly > cap are filtered out. */
  max_nightly_rate?: number;
  amenities?: HotelAmenity[];
  /** If set, filter down to pet-friendly properties. */
  pet_friendly?: boolean;
}

export interface SearchResult {
  hotel: Hotel;
  /** Cheapest nightly rate we can offer for this hotel, computed deterministically. */
  starting_nightly_rate: number;
}

export function searchHotels(filters: SearchFilters): SearchResult[] {
  const city = filters.city?.trim().toLowerCase();
  const amenities = new Set(filters.amenities ?? []);

  return CATALOG
    .filter((h) => (city ? h.city.toLowerCase() === city : true))
    .filter((h) =>
      filters.min_star_rating ? h.star_rating >= filters.min_star_rating : true,
    )
    .filter((h) =>
      amenities.size === 0 ? true : [...amenities].every((a) => h.amenities.includes(a)),
    )
    .filter((h) => (filters.pet_friendly ? h.amenities.includes("pet_friendly") : true))
    .map((hotel) => ({ hotel, starting_nightly_rate: baselineNightlyRate(hotel) }))
    .filter((r) =>
      filters.max_nightly_rate !== undefined
        ? r.starting_nightly_rate <= filters.max_nightly_rate
        : true,
    )
    .sort((a, b) => a.starting_nightly_rate - b.starting_nightly_rate);
}

// ──────────────────────────────────────────────────────────────────────────
// Availability
// ──────────────────────────────────────────────────────────────────────────

export interface AvailabilityArgs {
  hotel_id: string;
  check_in_date: string; // YYYY-MM-DD
  check_out_date: string; // YYYY-MM-DD
  guest_count: number;
}

export interface AvailabilityResult {
  hotel_id: string;
  offers: RoomOffer[];
}

export function checkAvailability(args: AvailabilityArgs): AvailabilityResult | null {
  const hotel = CATALOG.find((h) => h.hotel_id === args.hotel_id) ?? null;
  if (!hotel) return null;

  const nights = nightsBetween(args.check_in_date, args.check_out_date);
  if (nights <= 0) {
    return { hotel_id: args.hotel_id, offers: [] };
  }

  const baseline = baselineNightlyRate(hotel);
  const now = Date.now();
  const expires_at = new Date(now + OFFER_TTL_MS).toISOString();

  const allRoomTypes: RoomType[] = [
    "standard_queen",
    "standard_king",
    "deluxe_king",
    "suite",
    "twin_double",
    "family_room",
  ];

  // Deterministic: skip some room types based on a seeded hash of
  // (hotel_id + check_in_date). Keeps demo output varied per hotel but
  // stable per request.
  const seed = simpleHash(`${args.hotel_id}:${args.check_in_date}`);

  const offers: RoomOffer[] = [];
  allRoomTypes.forEach((room_type, idx) => {
    // Skip pattern: drop room types whose seeded bit is 0. Never drop
    // standard_queen — we want every hotel to have *something* to book.
    if (room_type !== "standard_queen" && ((seed >> idx) & 1) === 0) return;

    // Only allow room types that fit the party.
    if (maxOccupancyFor(room_type) < args.guest_count) return;

    const nightly_rate = roundTo(baseline * priceMultiplier(room_type), 2);
    const total_price = roundTo(nightly_rate * nights * 1.15, 2); // 15% taxes/fees
    const offer_id = `${args.hotel_id}:${room_type}:${args.check_in_date}:${args.check_out_date}:${idx}`;
    const deposit_required = room_type === "suite" || hotel.star_rating === 5;

    const offer: RoomOffer = {
      offer_id,
      hotel_id: args.hotel_id,
      room_type,
      room_name: displayNameFor(room_type),
      bed_configuration: bedConfigFor(room_type),
      max_occupancy: maxOccupancyFor(room_type),
      total_price,
      nightly_rate,
      currency: "USD",
      nights,
      refund_policy: refundPolicyFor(room_type),
      breakfast_included: room_type === "suite" || room_type === "family_room",
      deposit_required,
      expires_at,
    };

    offerStore.set(offer_id, offer);
    offers.push(offer);
  });

  // Sort cheapest-first so the shell's cards render predictably.
  offers.sort((a, b) => a.total_price - b.total_price);

  return { hotel_id: args.hotel_id, offers };
}

/**
 * Peek at an offer without removing it from the store. Used by the
 * create_reservation route to re-compute the server-expected canonical
 * hash BEFORE committing the booking — so a hash mismatch costs no
 * state mutation and the offer remains bookable on retry.
 *
 * Intentionally read-only. Expired offers are still returned so the
 * caller can surface a precise `offer_expired` error; the route checks
 * `expires_at` before using the offer.
 */
export function peekOffer(offer_id: string): RoomOffer | null {
  return offerStore.get(offer_id) ?? null;
}

/**
 * Remove expired offers from the in-memory store. Kept as a utility for
 * smoke tests; production runs lazily expire on lookup.
 */
export function sweepExpiredOffers(now: number = Date.now()): number {
  let swept = 0;
  for (const [id, offer] of offerStore) {
    if (Date.parse(offer.expires_at) < now) {
      offerStore.delete(id);
      swept++;
    }
  }
  return swept;
}

// ──────────────────────────────────────────────────────────────────────────
// Create / cancel
// ──────────────────────────────────────────────────────────────────────────

export interface CreateReservationArgs {
  offer_id: string;
  guest_name: string;
  guest_email: string;
  guest_count: number;
  /** Client-supplied idempotency key (from x-idempotency-key header). */
  idempotency_key?: string;
  /** Payment token from the PCI-scoped collector; mock-only value in dev. */
  payment_token?: string;
}

export type CreateReservationResult =
  | { ok: true; reservation: Reservation }
  | {
      ok: false;
      reason:
        | "offer_not_found"
        | "offer_expired"
        | "payment_required"
        | "hotel_not_found";
    };

export function createReservation(
  args: CreateReservationArgs,
  now: number = Date.now(),
): CreateReservationResult {
  const offer = offerStore.get(args.offer_id) ?? null;
  if (!offer) return { ok: false, reason: "offer_not_found" };

  if (Date.parse(offer.expires_at) < now) {
    offerStore.delete(offer.offer_id);
    return { ok: false, reason: "offer_expired" };
  }

  const hotel = CATALOG.find((h) => h.hotel_id === offer.hotel_id) ?? null;
  if (!hotel) return { ok: false, reason: "hotel_not_found" };

  if (offer.deposit_required && !args.payment_token) {
    return { ok: false, reason: "payment_required" };
  }

  // Idempotency: if this key already produced a reservation, return it.
  if (args.idempotency_key) {
    for (const r of reservationStore.values()) {
      if (
        r.offer_id === offer.offer_id &&
        r.guest_email === args.guest_email &&
        r.status === "confirmed"
      ) {
        return { ok: true, reservation: r };
      }
    }
  }

  // Derive check-in/check-out from offer id (format:
  // `${hotel_id}:${room_type}:${check_in}:${check_out}:${seq}`).
  const parts = offer.offer_id.split(":");
  const check_in_date = parts[2] ?? "";
  const check_out_date = parts[3] ?? "";

  const summary = canonicalHotelBookingSummary({
    hotel,
    offer,
    check_in_date,
    check_out_date,
    guest_count: args.guest_count,
    guest_name: args.guest_name,
  });
  const confirmation_hash = hashSummary(summary);

  const reservation: Reservation = {
    reservation_id: `res_htl_${randomToken()}`,
    hotel_id: hotel.hotel_id,
    offer_id: offer.offer_id,
    room_type: offer.room_type,
    check_in_date,
    check_out_date,
    nights: offer.nights,
    guest_count: args.guest_count,
    guest_name: args.guest_name,
    guest_email: args.guest_email,
    total_price: offer.total_price,
    currency: offer.currency,
    status: "confirmed",
    created_at: new Date(now).toISOString(),
    cancelled_at: null,
    confirmation_hash,
  };

  reservationStore.set(reservation.reservation_id, reservation);

  // One-shot offer: remove so a repeat create_reservation call with a
  // new idempotency key can't double-book it.
  offerStore.delete(offer.offer_id);

  return { ok: true, reservation };
}

export type CancelReservationResult =
  | { ok: true; reservation: Reservation; already_cancelled: boolean }
  | { ok: false; reason: "reservation_not_found" };

export function cancelReservation(
  reservation_id: string,
  now: number = Date.now(),
): CancelReservationResult {
  const current = reservationStore.get(reservation_id) ?? null;
  if (!current) return { ok: false, reason: "reservation_not_found" };

  if (current.status === "cancelled") {
    return { ok: true, reservation: current, already_cancelled: true };
  }

  const cancelled: Reservation = {
    ...current,
    status: "cancelled",
    cancelled_at: new Date(now).toISOString(),
  };
  reservationStore.set(reservation_id, cancelled);
  return { ok: true, reservation: cancelled, already_cancelled: false };
}

// ──────────────────────────────────────────────────────────────────────────
// Canonical booking summary — THE hash target
// ──────────────────────────────────────────────────────────────────────────

/**
 * The canonical summary both the shell and the server hash to decide
 * whether a book-tool call was the one the user confirmed.
 *
 * ⚠️  APPEND-ONLY. Changing a field name or type invalidates every
 * in-flight confirmation across the entire system. If the domain model
 * needs to evolve, bump the SDK kind (e.g. `structured-booking` →
 * `structured-booking-v2`) rather than mutating this shape in place.
 */
export function canonicalHotelBookingSummary(input: {
  hotel: Hotel;
  offer: RoomOffer;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  guest_name: string;
}): CanonicalHotelBookingSummary {
  return {
    domain: "hotel",
    hotel_id: input.hotel.hotel_id,
    hotel_name: input.hotel.name,
    city: input.hotel.city,
    address_line: input.hotel.address_line,
    offer_id: input.offer.offer_id,
    room_type: input.offer.room_type,
    room_name: input.offer.room_name,
    bed_configuration: input.offer.bed_configuration,
    check_in_date: input.check_in_date,
    check_out_date: input.check_out_date,
    nights: input.offer.nights,
    guest_count: input.guest_count,
    guest_name: input.guest_name,
    total_price: input.offer.total_price,
    currency: input.offer.currency,
    refund_policy: input.offer.refund_policy,
    deposit_required: input.offer.deposit_required,
  };
}

export interface CanonicalHotelBookingSummary {
  /** Literal "hotel" — lets the shell disambiguate at extraction time. */
  domain: "hotel";
  hotel_id: string;
  hotel_name: string;
  city: string;
  address_line: string;
  offer_id: string;
  room_type: RoomType;
  room_name: string;
  bed_configuration: BedConfiguration;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  guest_count: number;
  guest_name: string;
  total_price: number;
  currency: "USD";
  refund_policy: RefundPolicy;
  deposit_required: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────

function baselineNightlyRate(hotel: Hotel): number {
  // Base rate scales with star rating and guest score. Keeps $ figures
  // in demo-plausible ranges without having to hand-tune per property.
  const starFactor = { 3: 110, 4: 190, 5: 310 }[hotel.star_rating];
  const scoreBonus = Math.max(0, (hotel.guest_score - 7.5) * 20);
  const cityMult =
    hotel.city === "New York" ? 1.35 : hotel.city === "San Francisco" ? 1.2 : 1;
  return roundTo((starFactor + scoreBonus) * cityMult, 2);
}

function priceMultiplier(room_type: RoomType): number {
  return {
    standard_queen: 1.0,
    standard_king: 1.08,
    twin_double: 1.02,
    deluxe_king: 1.35,
    suite: 1.9,
    family_room: 1.45,
  }[room_type];
}

function maxOccupancyFor(room_type: RoomType): number {
  return {
    standard_queen: 2,
    standard_king: 2,
    twin_double: 4,
    deluxe_king: 3,
    suite: 4,
    family_room: 5,
  }[room_type];
}

function bedConfigFor(room_type: RoomType): BedConfiguration {
  return {
    standard_queen: "1 queen",
    standard_king: "1 king",
    twin_double: "2 double",
    deluxe_king: "1 king",
    suite: "1 king + sofa bed",
    family_room: "2 queen",
  }[room_type] as BedConfiguration;
}

function displayNameFor(room_type: RoomType): string {
  return {
    standard_queen: "Standard Queen Room",
    standard_king: "Standard King Room",
    twin_double: "Twin Double Room",
    deluxe_king: "Deluxe King Room",
    suite: "Suite",
    family_room: "Family Room",
  }[room_type];
}

function refundPolicyFor(room_type: RoomType): RefundPolicy {
  // Deluxe+ rooms tilt toward the stricter policy to mirror real rate plans.
  if (room_type === "suite") return "fully_refundable_until_72h";
  if (room_type === "deluxe_king" || room_type === "family_room")
    return "fully_refundable_until_24h";
  // 60/40 split of the cheaper rooms — deterministic via string hash.
  return simpleHash(room_type) % 5 === 0
    ? "non_refundable"
    : "fully_refundable_until_24h";
}

function nightsBetween(check_in: string, check_out: string): number {
  const a = Date.parse(`${check_in}T00:00:00Z`);
  const b = Date.parse(`${check_out}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / (24 * 3600 * 1000)));
}

function roundTo(n: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
