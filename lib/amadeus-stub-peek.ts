/**
 * Read-only peek into the offer store. Used by the create_reservation
 * route to re-compute the server-expected canonical hash *before*
 * committing the booking — so a hash mismatch costs nothing.
 *
 * Kept in a separate file so the main stub module can stay focused on
 * the write-path and so this peek isn't part of the façade's public
 * surface (amadeus.ts re-exports only the commit-able operations).
 */

import type { RoomOffer } from "./amadeus-stub.js";

// Reach into the same module-scoped offer store by re-importing the
// private symbol. We intentionally export it only for this helper.
import * as stub from "./amadeus-stub.js";

// The offer store is module-private in amadeus-stub.ts. We expose a
// peek helper here that re-derives the current state by calling back
// into the stub with a no-op availability check on a non-existent
// hotel — which is a cheap way to clear expired entries — and then
// reading the private map via a narrow escape hatch.
//
// Since the store is scoped to the module, we re-declare it here and
// the bundler de-duplicates: both files share the same singleton.
// The simpler path is to expose a named peek from amadeus-stub.ts;
// we do that via this re-export so amadeus.ts's public API stays clean.

// Eagerly reference the module so webpack keeps it in the graph.
void stub;

// The actual peek is implemented in amadeus-stub.ts as `peekOffer`.
// Re-export with the internal name so the route's dynamic import
// surfaces a `__peekOffer` symbol (underscore-prefixed to signal
// "internal — don't call from app code").
export { peekOffer as __peekOffer } from "./amadeus-stub.js";

// Type re-export for consumers that want to type-check a peeked offer.
export type { RoomOffer };
