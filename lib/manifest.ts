/**
 * Hotel Agent manifest factory.
 *
 * The manifest is the single source of truth the shell reads at registry
 * boot (via `/.well-known/agent.json`). It describes *what* this agent
 * does — not *how* — and declares the PII scope and SLA the router will
 * enforce. Shape matches Flight and Restaurant agents exactly so the
 * orchestrator can treat all three specialists uniformly.
 */

import { defineManifest, type AgentManifest } from "@lumo/agent-sdk";
import { publicBaseUrl } from "./public-base-url";

/**
 * Build the manifest at request time so `PUBLIC_BASE_URL` can be changed
 * without rebuilding (Vercel preview URLs, staging overlays, etc.).
 */
export function buildManifest(): AgentManifest {
  const base = publicBaseUrl();

  return defineManifest({
    agent_id: "hotel",
    version: "0.1.0",
    domain: "hotels",
    display_name: "Lumo Hotels",
    one_liner: "Search hotels and book rooms across US cities.",

    // Canonical intents the orchestrator maps utterances to. Keep these
    // stable — analytics joins on them.
    intents: [
      "search_hotels",
      "check_availability",
      "create_hotel_reservation",
    ],

    example_utterances: [
      "find me a hotel in San Francisco for next weekend",
      "book a 4-star hotel in Las Vegas check in Friday check out Sunday for 2 guests",
      "any pet-friendly hotels in Austin under $300 a night",
    ],

    openapi_url: `${base}/openapi.json`,

    ui: {
      // Registered component names the shell is allowed to render into
      // its canvas. These must also exist in the web shell's component
      // registry (module federation or a static allowlist).
      components: ["hotel_offers_card", "hotel_booking_card"],
    },

    health_url: `${base}/api/health`,

    // SLA budgets. The shell's circuit breaker uses p95_latency_ms as
    // the "latency overshoot" denominator; availability_target feeds the
    // rolling score. Numbers below are aspirational — tune after real
    // Amadeus traffic (Amadeus test API can be spiky under load).
    sla: {
      p50_latency_ms: 1500,
      p95_latency_ms: 4500,
      availability_target: 0.995,
    },

    // PII scope — the absolute max this agent may *ever* see. The router
    // intersects this with the per-tool `x-lumo-pii-required` so each
    // tool only gets what it strictly needs. Hotel bookings are
    // name + email; `payment_method_id` is only needed for
    // deposit-required (suite / 5-star) offers.
    pii_scope: ["name", "email", "payment_method_id"],

    requires_payment: true,

    // US-only to start. Amadeus covers global supply, but we limit the
    // manifest to jurisdictions where Lumo can settle deposit refunds
    // — same conservative stance as Flight and Restaurant.
    supported_regions: ["US"],

    // Contract self-declaration. Bump `sdk_version` when we rebuild
    // against a newer SDK — the shell's registry will warn if this
    // drifts from the package actually installed at runtime.
    // `implements_cancellation` is true because `hotel_cancel_reservation`
    // is wired from day one; the SDK's openapi bridge enforces the
    // bidirectional link between create + cancel at registry load.
    capabilities: {
      sdk_version: "0.3.0",
      supports_compound_bookings: true,
      implements_cancellation: true,
    },

    owner_team: "agents-platform",
  });
}
