/*
 * Logos for REAL, unaffiliated restaurants. An entry may be added ONLY when all of these hold
 * (audit and candidate sources: docs/real-restaurant-logos.md):
 *   1. the file comes from the restaurant's own official website or official brand/press assets;
 *   2. permission to use it in this prototype is established (written OK from the restaurant, or
 *      published brand/press-kit terms that cover this use) and recorded below;
 *   3. it is committed as an optimised LOCAL file in public/logos/ (no production hotlinking);
 *   4. it is the unmodified mark — never redrawn, AI-generated or recoloured.
 * A logo never implies integration or partnership: the "Real · not affiliated" label stays.
 * Fictional DEMO brands keep their own original monograms and never use this registry.
 *
 * Status 2026-09-29: EMPTY. Official logo files were found for 13 of 19 venues, but none
 * publishes usage terms and no permission has been obtained, so every venue keeps the
 * neutral placeholder.
 */
export interface RealLogo {
  /** Path under public/, e.g. "logos/mozza-eur.webp". */
  file: string;
  /** Official page the asset was taken from. */
  source: string;
  /** How permission was established (e.g. "email from owner, 2026-10-02, stored in study drive"). */
  permission: string;
  retrievedOn: string;
}

export const REAL_LOGOS: Record<string, RealLogo> = {};
