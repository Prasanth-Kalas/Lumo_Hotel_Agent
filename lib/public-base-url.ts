/**
 * Canonical public origin for this agent. Baked into `/.well-known/agent.json`
 * so the shell can link back and callers can resolve tool URLs.
 *
 * Fallback chain (first truthy wins):
 *   1. PUBLIC_BASE_URL          — explicit override, e.g. custom domain
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable prod alias (no scheme)
 *   3. VERCEL_URL               — Vercel's per-deploy alias (no scheme)
 *   4. http://localhost:3004    — local dev default
 */
export function publicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;

  const perDeploy = process.env.VERCEL_URL;
  if (perDeploy) return `https://${perDeploy}`;

  return "http://localhost:3004";
}
