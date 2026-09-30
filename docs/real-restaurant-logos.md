# Restaurant logos: provenance

**Rule.** Truthful representation beats visual polish. A real, unaffiliated restaurant gets a logo only when all of these hold:
- an official source: preferably a press/media kit or brand-asset page, otherwise the restaurant's own website;
- a documented usage basis for showing it in this prototype;
- a local, unmodified asset.

If anything is uncertain, the neutral dashed placeholder stays. A logo never replaces "Real · not affiliated" and never implies integration.

**Where it's enforced:**
- Real logos can only enter the data through [`src/data/realLogos.ts`](../src/data/realLogos.ts), which requires a source and a recorded permission.
- `realRestaurant()` in [`src/data/restaurants.ts`](../src/data/restaurants.ts) copies an entry into `Restaurant.logo`.
- [`BrandMark`](../src/components/BrandMark.tsx) renders every restaurant mark, with a fallback when a logo is missing or fails to load.

## Real restaurants (19): logo added to **none**

**Checks made on 2026-09-30:**
- Each official site was probed for a press, media or brand-asset page: `/pers`, `/press`, `/presskit`, `/press-kit`, `/media`, `/mediakit`, `/media-kit`, `/brand`, `/brand-assets`, `/huisstijl`, `/nl/pers`, `/en/press`, `/newsroom`, plus the sitemap.
  - **None exists.**
  - Erasmus Sport's `/pers` is a WordPress redirect to its personal-training page.
  - The Social Hub's press paths return 404.
- Logo files published on the sites themselves were identified in the first audit (2026-09-29). None of these sites states terms that would cover using the logo in this prototype, and no permission was requested or received.

**Usage basis for every row: not established.** Official site only; no press/brand terms and no permission. For the rows that say "no permission", that is the only blocker.

| Restaurant | Logo added? | Candidate source (not used) | Source type | Local asset path | Additional blocker | Date checked |
|---|---|---|---|---|---|---|
| Sally's Salads | NO | logo on sallyssalads.nl, lazy-loaded (not extracted) | official website | — | asset not extracted | 2026-09-30 |
| Mozza | NO | `mozzaeur.nl/wp-content/uploads/Mozza-Logo.png` | official website | — | no permission | 2026-09-30 |
| Erasmus Paviljoen | NO | `erasmuspaviljoen.nl/wp-content/uploads/2024/07/logo_groot.png` | official website | — | no permission | 2026-09-30 |
| Tosti World | NO | `tostiworld.nl/wp-content/themes/tostiworld/images/logo.png` | official website (chain) | — | no permission | 2026-09-30 |
| Coffeecompany Erasmus | NO | `coffeecompany.nl/assets/svg/logo-….svg` | official website (chain) | — | no permission | 2026-09-30 |
| Erasmus Sport Café | NO | `erasmussport.nl/…/Logo_Erasmus_Sport_2019_RGB-1.png` | official website (the sports centre) | — | the mark belongs to the institution, not the café; `/pers` is not a press page | 2026-09-30 |
| Restobar Colette | NO | `coletterotterdam.nl/_webblocks/images/colette_logo.svg` | official website | — | no permission | 2026-09-30 |
| Lokanta Proeflokaal | NO | `lokanta-proeflokaal.nl/_astro/lokantaproeflokaal.….png` | official website | — | no permission | 2026-09-30 |
| Café Stobbe | NO | `cafestobbe.nl/…/Logo-Stobbe-Wit.svg` (white variant only) | official website | — | recolouring for a light background would modify it | 2026-09-30 |
| De Specialiteit | NO | "logo de specialiteit groen RGB.png" (site CDN) | official website (multi-location) | — | no permission | 2026-09-30 |
| De Boshut | NO | `deboshutrotterdam.nl/…/deboshut_logo_creme_liggend.png` (cream variant) | official website | — | light variant only | 2026-09-30 |
| I Love Sushi | NO | logo on ilovesushi.nl, lazy-loaded (not extracted) | official website (chain) | — | asset not extracted | 2026-09-30 |
| Van Stralen | NO | image named `gold-luxury-initial-circle-logo…` | official website | — | appears to be a site-template stock image: **authenticity unclear** | 2026-09-30 |
| Curry's | NO | `currys.nl/assets/currys-logo.png` | official website | — | no permission | 2026-09-30 |
| Mama Licia | NO | none (only a photo) | — | — | no logo asset exists | 2026-09-30 |
| Macho Mama | NO | `macho-mama.nl/tpl/template1/images/logo/logo_1.png` | official website | — | no permission (a Thuisbezorgd copy exists; third-party, excluded) | 2026-09-30 |
| Toko Smoor | NO | `tokosmoor.nl/…/TOKOSMOOR-NEWLOGO-1024x290.png` | official website | — | no permission | 2026-09-30 |
| The Commons | NO | none on the page (brand: The Social Hub) | — | — | no asset; no press page | 2026-09-30 |
| Maas | NO | none extracted (Wix site) | — | — | no logo asset found | 2026-09-30 |

**To add one later:**
1. Get written permission from the venue, or find published press/brand terms that cover this use. Store the evidence outside the repo.
2. Download the asset from the source above, unmodified. Save it as an optimised SVG/WebP in `public/logos/real/<restaurant-id>.<ext>`.
3. Add a `REAL_LOGOS` entry with `file`, `source`, `permission` and `retrievedOn`. Tests check that every entry is for a real venue, has a local file, and records permission.

## Fictional demo restaurants (6): original marks added

Each is an **original fictional MacroTable demo-brand asset**, drawn for this prototype on 2026-09-30:
- a rounded tile in the brand's existing colour (`Restaurant.brand.color`), with one simple white food glyph;
- no text, and no imitation of any real restaurant or trademark;
- plain SVG, 535–632 bytes each, loaded locally and cached by the PWA.

The DEMO labels, integration labels and provenance badges beside them are unchanged. If a file fails to load, the brand's monogram is shown instead.

| Demo restaurant | Glyph | Asset |
|---|---|---|
| FitKitchen | bowl with a leaf | `public/logos/demo/fitkitchen.svg` |
| Urban Bowl | bowl with chopsticks | `public/logos/demo/urbanbowl.svg` |
| Local Grill | flame over a grill | `public/logos/demo/localgrill.svg` |
| Pasta Metrica | fork with pasta | `public/logos/demo/pastametrica.svg` |
| Saffron & Steam | steaming bowl | `public/logos/demo/saffronsteam.svg` |
| Tinplate Deli | sandwich wedge | `public/logos/demo/tinplate.svg` |
