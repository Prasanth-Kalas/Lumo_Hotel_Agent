/**
 * Operator status page. This agent does not render user-facing UI —
 * the Lumo shell owns the conversation. This page exists so a human
 * landing on the bare origin gets a useful overview instead of a
 * stock Next.js placeholder.
 */

import { publicBaseUrl } from "@/lib/public-base-url";
import { amadeusEnabled } from "@/lib/amadeus-real";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const base = publicBaseUrl();
  const mode = amadeusEnabled() ? "real (Amadeus)" : "mock (in-memory catalog)";

  return (
    <main
      style={{
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        maxWidth: 720,
        margin: "64px auto",
        padding: "0 24px",
        color: "#111",
        lineHeight: 1.55,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Lumo Hotel Agent</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Specialist agent for hotel search, availability, and bookings. Speaks
        the <code>@lumo/agent-sdk</code> contract so the Lumo shell can
        discover and dispatch to it.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Mode</h2>
        <p>
          Currently running in <strong>{mode}</strong>. Set{" "}
          <code>AMADEUS_CLIENT_ID</code> and <code>AMADEUS_CLIENT_SECRET</code>{" "}
          in the environment to switch read-path to the Amadeus Self-Service API.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Discovery endpoints</h2>
        <ul>
          <li>
            <a href={`${base}/.well-known/agent.json`}>/.well-known/agent.json</a>
          </li>
          <li>
            <a href={`${base}/openapi.json`}>/openapi.json</a>
          </li>
          <li>
            <a href={`${base}/api/health`}>/api/health</a>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Tools</h2>
        <ul>
          <li>
            <code>hotel_search_hotels</code> — free
          </li>
          <li>
            <code>hotel_check_availability</code> — low cost
          </li>
          <li>
            <code>hotel_create_reservation</code> — money (requires{" "}
            <code>structured-booking</code> confirmation)
          </li>
          <li>
            <code>hotel_cancel_reservation</code> — free (Saga rollback, no
            confirmation)
          </li>
        </ul>
      </section>

      <footer style={{ marginTop: 48, color: "#888", fontSize: 13 }}>
        Base URL: <code>{base}</code>
      </footer>
    </main>
  );
}
