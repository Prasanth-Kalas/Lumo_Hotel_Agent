/**
 * OpenAPI 3.1 spec for the Lumo Hotel Agent's tool surface.
 *
 * The shell parses this at registry boot and generates the LLM-facing
 * tool descriptors from the x-lumo-* extensions. Keep the path set,
 * request/response schemas, and cost/confirmation extensions aligned
 * with the Restaurant and Flight Agent specs — they are cross-validated
 * by the SDK's openapi bridge.
 */

import { publicBaseUrl } from "@/lib/public-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = publicBaseUrl();

  const doc = {
    openapi: "3.1.0",
    info: {
      title: "Lumo Hotel Agent",
      version: "0.1.0",
      description:
        "Hotel search, room availability, and booking / cancellation. Mock-first against an in-memory catalog; swaps behind the same contract to Amadeus Self-Service once AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET are set.",
    },
    servers: [{ url: base }],

    paths: {
      "/api/tools/hotel_search_hotels": {
        post: {
          summary: "Search hotels by city and filters.",
          operationId: "hotel_search_hotels",
          "x-lumo-tool": "hotel_search_hotels",
          "x-lumo-cost-tier": "free",
          "x-lumo-pii-required": [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HotelSearchRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "List of matching hotels ranked cheapest-first.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HotelSearchResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },

      "/api/tools/hotel_check_availability": {
        post: {
          summary: "Check room availability and get bookable offers for a hotel.",
          operationId: "hotel_check_availability",
          "x-lumo-tool": "hotel_check_availability",
          "x-lumo-cost-tier": "low",
          "x-lumo-pii-required": [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AvailabilityRequest" },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Bookable room offers with per-offer totals and a 15-minute TTL.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AvailabilityResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "404": { $ref: "#/components/responses/HotelNotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },

      "/api/tools/hotel_create_reservation": {
        post: {
          summary: "Book a hotel room for an offer the user has confirmed.",
          operationId: "hotel_create_reservation",
          "x-lumo-tool": "hotel_create_reservation",
          "x-lumo-cost-tier": "money",
          "x-lumo-requires-confirmation": "structured-booking",
          "x-lumo-pii-required": ["name", "email"],
          "x-lumo-cancels": "hotel_cancel_reservation",
          parameters: [
            {
              name: "x-idempotency-key",
              in: "header",
              required: false,
              description:
                "Client-supplied idempotency key. A repeat call with the same key returns the existing reservation instead of double-booking.",
              schema: { type: "string", minLength: 8, maxLength: 128 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReservationCreateRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reservation confirmed.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Reservation" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "402": { $ref: "#/components/responses/PaymentRequired" },
            "409": { $ref: "#/components/responses/ConfirmationRequired" },
            "410": { $ref: "#/components/responses/OfferExpired" },
            "404": { $ref: "#/components/responses/OfferNotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },

      "/api/tools/hotel_cancel_reservation": {
        post: {
          summary:
            "Cancel a previously confirmed reservation. Idempotent — a repeat call on an already-cancelled id returns 200 with already_cancelled=true. Invoked by the Saga rollback path with no human in the loop, so no confirmation gate.",
          operationId: "hotel_cancel_reservation",
          "x-lumo-tool": "hotel_cancel_reservation",
          "x-lumo-cost-tier": "free",
          "x-lumo-pii-required": [],
          "x-lumo-cancel-for": "hotel_create_reservation",
          "x-lumo-compensation-kind": "saga-rollback",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReservationCancelRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reservation cancelled (or already was).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CancelResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "404": { $ref: "#/components/responses/ReservationNotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
    },

    components: {
      schemas: {
        // ── Request schemas ────────────────────────────────────────
        HotelSearchRequest: {
          type: "object",
          additionalProperties: false,
          properties: {
            city: {
              type: "string",
              description: "Free-text city name, matched case-insensitively.",
              minLength: 2,
            },
            min_star_rating: {
              type: "integer",
              enum: [3, 4, 5],
              description: "Minimum hotel star rating.",
            },
            max_nightly_rate: {
              type: "number",
              exclusiveMinimum: 0,
              description: "Nightly budget ceiling in USD.",
            },
            amenities: {
              type: "array",
              items: { $ref: "#/components/schemas/HotelAmenity" },
              description: "All amenities in this list must be present.",
            },
            pet_friendly: {
              type: "boolean",
              description: "Filter to hotels that accept pets.",
            },
          },
        },

        AvailabilityRequest: {
          type: "object",
          required: ["hotel_id", "check_in_date", "check_out_date", "guest_count"],
          additionalProperties: false,
          properties: {
            hotel_id: { type: "string", pattern: "^htl_[a-z0-9_]+$" },
            check_in_date: {
              type: "string",
              format: "date",
              description: "YYYY-MM-DD (UTC).",
            },
            check_out_date: {
              type: "string",
              format: "date",
              description: "YYYY-MM-DD (UTC). Must be after check_in_date.",
            },
            guest_count: { type: "integer", minimum: 1, maximum: 8 },
          },
        },

        ReservationCreateRequest: {
          type: "object",
          required: [
            "offer_id",
            "guest_name",
            "guest_email",
            "guest_count",
            "summary_hash",
            "user_confirmed",
          ],
          additionalProperties: false,
          properties: {
            offer_id: { type: "string" },
            guest_name: { type: "string", minLength: 2, maxLength: 100 },
            guest_email: { type: "string", format: "email" },
            guest_count: { type: "integer", minimum: 1, maximum: 8 },
            payment_token: {
              type: "string",
              description:
                "Opaque token from the PCI-scoped collector. Required for deposit-gated offers.",
              minLength: 4,
              maxLength: 256,
            },
            summary_hash: {
              type: "string",
              pattern: "^[a-f0-9]{64}$",
              description:
                "sha256 of the canonical booking summary the user confirmed. Server re-computes and 409s on mismatch.",
            },
            user_confirmed: {
              type: "boolean",
              enum: [true],
              description:
                "Must be literal true. The shell's confirmation gate sets this after the user affirms the BookingConfirmationCard.",
            },
          },
        },

        ReservationCancelRequest: {
          type: "object",
          required: ["reservation_id"],
          additionalProperties: false,
          properties: {
            reservation_id: {
              type: "string",
              pattern: "^res_htl_[a-z0-9]+$",
              description: "ID returned by hotel_create_reservation.",
            },
            reason: {
              type: "string",
              maxLength: 300,
              description:
                "Optional free-text reason. Saga rollback fills 'compound_saga_rollback'.",
            },
          },
        },

        // ── Domain schemas ─────────────────────────────────────────
        HotelAmenity: {
          type: "string",
          enum: [
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
          ],
        },
        HotelSearchResponse: {
          type: "object",
          required: ["hotels"],
          additionalProperties: false,
          properties: {
            hotels: {
              type: "array",
              items: {
                type: "object",
                required: ["hotel", "starting_nightly_rate"],
                properties: {
                  hotel: { $ref: "#/components/schemas/Hotel" },
                  starting_nightly_rate: { type: "number", exclusiveMinimum: 0 },
                },
              },
            },
          },
        },
        AvailabilityResponse: {
          type: "object",
          required: ["hotel_id", "offers"],
          additionalProperties: false,
          properties: {
            hotel_id: { type: "string" },
            offers: {
              type: "array",
              items: { $ref: "#/components/schemas/RoomOffer" },
            },
          },
        },
        Hotel: {
          type: "object",
          required: [
            "hotel_id",
            "name",
            "city",
            "region",
            "country",
            "address_line",
            "star_rating",
            "guest_score",
            "amenities",
            "latitude",
            "longitude",
            "description",
          ],
          properties: {
            hotel_id: { type: "string", pattern: "^htl_[a-z0-9_]+$" },
            name: { type: "string" },
            brand: { type: ["string", "null"] },
            city: { type: "string" },
            region: { type: "string", minLength: 2, maxLength: 3 },
            country: { type: "string", minLength: 2, maxLength: 2 },
            address_line: { type: "string" },
            star_rating: { type: "integer", enum: [3, 4, 5] },
            guest_score: { type: "number", minimum: 0, maximum: 10 },
            amenities: {
              type: "array",
              items: { $ref: "#/components/schemas/HotelAmenity" },
            },
            latitude: { type: "number" },
            longitude: { type: "number" },
            description: { type: "string" },
          },
        },
        RoomOffer: {
          type: "object",
          required: [
            "offer_id",
            "hotel_id",
            "room_type",
            "room_name",
            "bed_configuration",
            "max_occupancy",
            "total_price",
            "nightly_rate",
            "currency",
            "nights",
            "refund_policy",
            "breakfast_included",
            "deposit_required",
            "expires_at",
          ],
          properties: {
            offer_id: { type: "string" },
            hotel_id: { type: "string" },
            room_type: {
              type: "string",
              enum: [
                "standard_queen",
                "standard_king",
                "deluxe_king",
                "suite",
                "twin_double",
                "family_room",
              ],
            },
            room_name: { type: "string" },
            bed_configuration: { type: "string" },
            max_occupancy: { type: "integer", minimum: 1, maximum: 8 },
            total_price: { type: "number", exclusiveMinimum: 0 },
            nightly_rate: { type: "number", exclusiveMinimum: 0 },
            currency: { type: "string", enum: ["USD"] },
            nights: { type: "integer", minimum: 1 },
            refund_policy: {
              type: "string",
              enum: [
                "fully_refundable_until_24h",
                "fully_refundable_until_72h",
                "non_refundable",
              ],
            },
            breakfast_included: { type: "boolean" },
            deposit_required: { type: "boolean" },
            expires_at: { type: "string", format: "date-time" },
          },
        },
        Reservation: {
          type: "object",
          required: [
            "reservation_id",
            "hotel_id",
            "offer_id",
            "room_type",
            "check_in_date",
            "check_out_date",
            "nights",
            "guest_count",
            "guest_name",
            "guest_email",
            "total_price",
            "currency",
            "status",
            "created_at",
            "cancelled_at",
            "confirmation_hash",
          ],
          properties: {
            reservation_id: { type: "string" },
            hotel_id: { type: "string" },
            offer_id: { type: "string" },
            room_type: { type: "string" },
            check_in_date: { type: "string", format: "date" },
            check_out_date: { type: "string", format: "date" },
            nights: { type: "integer", minimum: 1 },
            guest_count: { type: "integer", minimum: 1 },
            guest_name: { type: "string" },
            guest_email: { type: "string", format: "email" },
            total_price: { type: "number" },
            currency: { type: "string", enum: ["USD"] },
            status: { type: "string", enum: ["confirmed", "cancelled"] },
            created_at: { type: "string", format: "date-time" },
            cancelled_at: { type: ["string", "null"], format: "date-time" },
            confirmation_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
        CancelResponse: {
          type: "object",
          required: ["reservation", "already_cancelled"],
          additionalProperties: false,
          properties: {
            reservation: { $ref: "#/components/schemas/Reservation" },
            already_cancelled: { type: "boolean" },
          },
        },
        ErrorEnvelope: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: {},
          },
        },
      },

      responses: {
        BadRequest: {
          description: "Request failed validation.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        RateLimited: {
          description: "Per-client rate limit exceeded.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        HotelNotFound: {
          description: "hotel_id is not in the catalog.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        OfferNotFound: {
          description: "offer_id was never issued (or was booked on another call).",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        OfferExpired: {
          description:
            "offer_id was issued but the 15-minute TTL has elapsed. Client should re-run hotel_check_availability and present the fresh summary to the user.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        PaymentRequired: {
          description:
            "Offer requires a deposit but no payment_token was supplied. Shell should route the user through the PCI-scoped collector and retry.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        ConfirmationRequired: {
          description:
            "summary_hash did not match the server's recomputed hash of the canonical booking summary. Re-render the BookingConfirmationCard and retry after user affirms.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        ReservationNotFound: {
          description: "reservation_id is not in the reservations store.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
      },
    },
  };

  return Response.json(doc, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
