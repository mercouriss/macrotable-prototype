import type { Provenance, Restaurant } from "../types";

/*
 * Provenance labels describe the DATA, not a commercial relationship.
 * All VERIFIED / OFFICIAL data in this prototype is simulated for fictional demo
 * brands, so it is labelled DEMO VERIFIED / DEMO OFFICIAL. A plain OFFICIAL label
 * is reserved for data genuinely taken from an authoritative restaurant source
 * (none in this prototype).
 */
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  verified: "DEMO VERIFIED",
  official: "DEMO OFFICIAL",
  "menu-read": "MENU-READ",
  estimated: "ESTIMATED",
  insufficient: "INSUFFICIENT",
};

export const provenanceLabel = (p: Provenance) => PROVENANCE_LABEL[p];

/** How MacroTable relates to a restaurant — honest for real, unaffiliated businesses. */
export function relationshipLabel(r: Pick<Restaurant, "identity" | "integrationLevel">): string {
  if (r.identity === "real") return "Real restaurant · not affiliated";
  return { 3: "Demo · full kitchen integration (simulated)", 2: "Demo · structured menu data (simulated)", 1: "Demo · menu only, not integrated" }[r.integrationLevel];
}

/** Unobtrusive disclosure shown in Explore, restaurant pages, the desktop shell and the privacy notice. */
export const REALISM_DISCLOSURE =
  "Prototype demonstration: restaurant identities/locations marked “Real” are real and not affiliated with MacroTable. Demo restaurants, MacroTable integrations, menus, nutrition, availability and ordering are simulated.";
