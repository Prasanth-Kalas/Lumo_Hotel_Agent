/**
 * Tiny HTTP helpers — keep tool routes focused on domain logic, not on
 * shaping error envelopes. All agents in the Lumo stack return the same
 * { code, message, details? } shape so the shell can surface them
 * uniformly in the chat transcript.
 */

import type { ZodError } from "zod";

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

export function errorResponse(
  code: string,
  status: number,
  message?: string,
  details?: unknown,
): Response {
  const body: ErrorEnvelope = {
    code,
    message: message ?? code,
    ...(details !== undefined ? { details } : {}),
  };
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function badRequestFromZod(err: ZodError): Response {
  return errorResponse(
    "bad_request",
    400,
    "Request body failed validation.",
    err.flatten(),
  );
}

/**
 * Remove underscore-prefixed envelope keys from a request body before zod
 * strict() validation. The shell occasionally echoes back internal keys
 * like `_lumo_turn_id`; we strip them rather than failing strict().
 */
export function stripEnvelopeKeys<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out as T;
}
