# Real-restaurant logos: audit and provenance

Audited 2026-09-29 by fetching each venue's **own website** (the same site used to verify its identity). Image searches, social avatars, delivery-platform copies (e.g. Thuisbezorgd) and third-party logo sites were **not** used.

**Rule.** A logo is used only when (1) it comes from the official site or official brand/press assets, (2) permission for this use is established and recorded, (3) it is committed as an optimised local file, and (4) it is unmodified. The machine-readable registry is [`src/data/realLogos.ts`](../src/data/realLogos.ts). Until it has an entry, `BrandMark` shows the neutral dashed initial.

**Result: 0 logos added.** Official logo files exist for 13 of the 19 venues, but **none** publishes brand or press-kit terms, and no permission has been requested yet. Under the brief's rule ("if licensing/usage … is unclear, keep the neutral placeholder") every venue keeps its placeholder.

| Venue | Type | Official asset found on own site (candidate) | Status | Blocking reason |
|---|---|---|---|---|
| Sally's Salads | brand (multi-location) | logo on site, lazy-loaded; not extracted | placeholder | no usage terms; asset not extracted |
| Mozza | campus venue | `mozzaeur.nl/wp-content/uploads/Mozza-Logo.png` | placeholder | no usage terms / permission |
| Erasmus Paviljoen | independent | `erasmuspaviljoen.nl/wp-content/uploads/2024/07/logo_groot.png` | placeholder | no usage terms / permission |
| Tosti World | brand (chain) | `tostiworld.nl/wp-content/themes/tostiworld/images/logo.png` | placeholder | no usage terms / permission |
| Coffeecompany Erasmus | brand (chain) | `coffeecompany.nl/assets/svg/logo-….svg` | placeholder | no usage terms / permission |
| Erasmus Sport Café | university sports centre | `erasmussport.nl/…/Logo_Erasmus_Sport_2019_RGB-1.png` (organisation logo, not café-specific) | placeholder | no permission; the mark belongs to the institution, not the café |
| Restobar Colette | independent | `coletterotterdam.nl/_webblocks/images/colette_logo.svg` | placeholder | no usage terms / permission |
| Lokanta Proeflokaal | independent | `lokanta-proeflokaal.nl/_astro/lokantaproeflokaal.….png` | placeholder | no usage terms / permission |
| Café Stobbe | independent | `cafestobbe.nl/…/Logo-Stobbe-Wit.svg` (white-on-transparent only) | placeholder | no permission; only a light variant, and recolouring = modification |
| De Specialiteit | brand (multi-location) | "logo de specialiteit groen RGB.png" (site CDN) | placeholder | no usage terms / permission |
| De Boshut | independent | `deboshutrotterdam.nl/…/deboshut_logo_creme_liggend.png` (cream variant) | placeholder | no permission; light variant only |
| I Love Sushi | brand (chain) | logo on site, lazy-loaded; not extracted | placeholder | no usage terms; asset not extracted |
| Van Stralen | independent | image named `gold-luxury-initial-circle-logo…` (appears to be a website-template stock image) | placeholder | authenticity unclear |
| Curry's | independent | `currys.nl/assets/currys-logo.png` | placeholder | no usage terms / permission |
| Mama Licia | independent | none (only a photo) | placeholder | no logo asset |
| Macho Mama | independent | `macho-mama.nl/tpl/template1/images/logo/logo_1.png` | placeholder | no usage terms / permission |
| Toko Smoor | independent | `tokosmoor.nl/…/TOKOSMOOR-NEWLOGO-1024x290.png` | placeholder | no usage terms / permission |
| The Commons | part of The Social Hub (hotel brand) | none on the fetched page | placeholder | no asset; brand-level press assets not checked for app use |
| Maas | independent | none extracted (Wix site) | placeholder | no logo asset found |

## How to add one later
1. Get written permission from the venue, or find published brand/press-kit terms covering this use. Store the evidence outside the repo.
2. Download the asset **from the source listed above**. Convert it to a small WebP/SVG in `public/logos/<restaurant-id>.webp` without redrawing or recolouring it.
3. Add a `REAL_LOGOS` entry with `file`, `source`, `permission` and `retrievedOn`. The tests check that every entry has a local file and a recorded permission.
4. Keep "Real · not affiliated". A logo never implies integration, a menu, or ordering.
