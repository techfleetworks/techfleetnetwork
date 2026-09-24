/**
 * Single source of truth for which Project Openings tab an opening belongs to (ADR-0057).
 *
 * A Shipathon (a cross-functional hackathon, `is_shipathon = true`) belongs on the **Hackathons**
 * tab and is deliberately excluded from the Client/Volunteer tabs, so a project never appears in two
 * tabs. Otherwise the existing partition holds: an internal client is a Volunteer Opening, everything
 * else is a Client Project Opening. Both the tab filters and the tab-count badges derive from this,
 * so they can't drift.
 */
export type OpeningCategory = "hackathon" | "volunteer" | "client";

export interface OpeningCategoryInput {
  is_shipathon?: boolean | null;
  clientKind?: "external" | "internal";
}

export function getOpeningCategory(p: OpeningCategoryInput): OpeningCategory {
  // Shipathon wins first, so a hackathon with an internal or external client still lands on the
  // Hackathons tab (never double-listed under Client/Volunteer).
  if (p?.is_shipathon === true) return "hackathon";
  return p?.clientKind === "internal" ? "volunteer" : "client";
}
