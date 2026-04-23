# Lumo Hotel Agent

Amadeus-style hotel search, availability, and booking. Speaks the
`@lumo/agent-sdk` contract so the Lumo shell can discover and dispatch to
it at `/.well-known/agent.json` + `/openapi.json`.

## Why mock-first

Unlike OpenTable (restaurants) and Duffel (flights), Amadeus ships a
self-serve test API at `test.api.amadeus.com` that doesn't require
partner onboarding — but we still scaffold against an in-memory catalog
first so the orchestrator work isn't blocked on any external system at
all. The same façade pattern the Flight and Restaurant agents use
(`lib/amadeus-stub.ts` vs `lib/amadeus-real.ts`, routed by
`lib/amadeus.ts`) makes the real-client drop-in a clean swap once we're
ready to point at Amadeus.

## Tools exposed

| Tool                          | Cost tier | Confirmation          | Cancel counterpart              |
| ----------------------------- | --------- | --------------------- | ------------------------------- |
| `hotel_search_hotels`         | free      | —                     | —                               |
| `hotel_check_availability`    | low       | —                     | —                               |
| `hotel_create_reservation`    | money     | `structured-booking`  | `hotel_cancel_reservation`      |
| `hotel_cancel_reservation`    | free      | (none — Saga invokes) | ← `hotel_create_reservation`    |

## Confirmation hash gate

Same gate the Flight and Restaurant Agents implement: the shell computes
a `summary_hash` over the canonical booking summary the user confirmed,
the server re-computes the same hash, and a mismatch returns 409
`confirmation_required`. The canonical shape lives in
`canonicalHotelBookingSummary()` inside `lib/amadeus-stub.ts` and MUST be
identical on both sides — any field change invalidates every in-flight
confirmation across the system. **Append-only.**

## Run locally

```sh
pnpm install
pnpm dev           # http://localhost:3004
curl http://localhost:3004/.well-known/agent.json
curl http://localhost:3004/openapi.json
curl http://localhost:3004/api/health
pnpm smoke         # end-to-end: search → availability → book → cancel
```

## Env

See `.env.example`. `AMADEUS_CLIENT_ID` + `AMADEUS_CLIENT_SECRET` are
intentionally unset on this scaffold — the stub handles the whole loop
without partner credentials. `PUBLIC_BASE_URL` is baked into the
manifest so downstream consumers can link back.

## Deploy

Standard Next.js app targeting Vercel. `vercel.json` bumps `maxDuration`
to 30s on the tool routes so the confirmation-gate round-trip has
headroom for real Amadeus latency when the live client lands. Match
the Flight and Restaurant Agents' deploy posture — one project per
agent, pinned to the git-SHA `@lumo/agent-sdk` dep.

## What's next

1. Swap `lib/amadeus-real.ts` from throwing stubs to real
   `test.api.amadeus.com` calls (oauth2 client-credentials + five
   endpoints listed in the file).
2. Register a compound-booking UI card (`BookingConfirmationCard`)
   in the shell's component allowlist so the confirmation gate can
   render the hotel-specific summary.
3. Wire a runtime env var `LUMO_HOTEL_AGENT_URL` on the Super Agent's
   Vercel project and flip the hotel entry to `enabled: true` in
   `agents.registry.vercel.json`.
