# Restaurant logos: provenance

## Standard (updated 2026-09-30)

A real, unaffiliated restaurant shows its **authentic logo** only when:
1. the file is the logo the restaurant (or, for a chain or outlet, its parent brand) publishes **on its own official website**;
2. the file is stored **locally**. SVGs are byte-identical copies. Rasters are only resized and re-encoded (no crop, recolour, redraw or trace);
3. the page URL, exact asset URL, source type and retrieval date are recorded in [`src/data/realLogos.ts`](../src/data/realLogos.ts).

**Using a logo that a restaurant's own site publishes does not establish a trademark licence, permission or partnership, and MacroTable claims none.** Every real card still says **Real · not affiliated**. A logo never implies a menu, integration or ordering.

**Never used:**
- delivery platforms (Thuisbezorgd, Uber Eats, Deliveroo, DoorDash) and directories (Google, TripAdvisor, Yelp);
- social media and logo-aggregation sites;
- screenshots, AI-generated, traced or approximated marks.

When no authentic first-party asset exists, the neutral dashed placeholder stays.

**Rendering:** [`BrandMark`](../src/components/BrandMark.tsx) handles every mark:
- square marks get a square box;
- horizontal wordmarks get a box up to 2.6× the height (scaled with `object-fit: contain`, never cropped);
- white, cream or yellow marks sit on the dark tile they were designed for;
- a failed load falls back to the placeholder;
- every logo file (SVG and WebP) is in the PWA precache (`vite.config.ts` `globPatterns`), so logos still show offline.

## Real restaurants: audit of all 19 (checked 2026-09-30)

**AUTHENTIC REAL LOGOS: 16 / 19 · PLACEHOLDERS REMAINING: 3 / 19**

| Restaurant | Official website | Authentic logo found? | Exact first-party source | Asset type | Local file | Notes |
|---|---|---|---|---|---|---|
| Sally's Salads | sallyssalads.nl | **YES** | `sallyssalads.nl/wp-content/uploads/2024/08/Sallys_Salads_logo.png` | header logo (PNG, white wordmark) | `logos/real/sallys-salads-eur.webp` | Chain brand logo; shown on a dark tile (it's white) |
| Mozza | mozzaeur.nl | **YES** | `mozzaeur.nl/wp-content/uploads/Mozza-Logo.png` | header logo (PNG) | `logos/real/mozza-eur.webp` | Original is a 7 MB 7076×3532 PNG; resized to 360 px (31 KB) |
| Erasmus Paviljoen | erasmuspaviljoen.nl | **YES** | `erasmuspaviljoen.nl/wp-content/uploads/2024/07/logo_groot.png` | header logo (PNG wordmark) | `logos/real/erasmus-paviljoen.webp` | Very wide (8.6:1), so it's small at card size; the site's diamond icon isn't name-bearing and wasn't used |
| Tosti World | tostiworld.nl | **YES** | `tostiworld.nl/wp-content/themes/tostiworld/images/logo.png` | header logo (PNG) | `logos/real/tostiworld-eur.webp` | Chain brand logo |
| Coffeecompany Erasmus | coffeecompany.nl | **YES** | `coffeecompany.nl/assets/svg/logo-cbc777e6….svg` | header logo (**SVG**) | `logos/real/coffeecompany-eur.svg` | Chain brand logo; byte-identical SVG |
| Erasmus Sport Café | erasmussport.nl | **YES** (parent brand) | `erasmussport.nl/wp-content/uploads/2020/05/Logo_Erasmus_Sport_2019_RGB-1.png` | parent-brand header logo (PNG) | `logos/real/erasmus-sport-cafe.webp` | The café is part of Erasmus Sport (its address is on erasmussport.nl); there's no café-specific mark |
| Restobar Colette | coletterotterdam.nl | **YES** | `coletterotterdam.nl/_webblocks/images/colette_logo.svg` | header logo (**SVG**) | `logos/real/restobar-colette.svg` | Byte-identical SVG. The same site serves an "Osteria Vicini" `logo.svg` (a different restaurant): not used |
| Lokanta Proeflokaal | lokanta-proeflokaal.nl | **NO** | — | — | — | **The official site is currently disabled**: host returns HTTP 402 "DEPLOYMENT_DISABLED" (it was live on 2026-09-29). The previously seen asset `/_astro/lokantaproeflokaal.….png` also returns 402. Its operating status may need re-checking; not changed here |
| Café Stobbe | cafestobbe.nl | **YES** | `cafestobbe.nl/wp-content/uploads/2019/08/Logo-Stobbe-Wit.svg` | header logo (**SVG**, white) | `logos/real/cafe-stobbe.svg` | Byte-identical; shown on a dark tile instead of being recoloured |
| De Specialiteit | despecialiteit.nl | **YES** | `prod1-plate-attachments.s3.amazonaws.com/images/db26aa44d9/logo de specialiteit groen RGB.png`, loaded by `despecialiteit.nl/locatie/pniel` | header logo (PNG) from the site's own CMS media store | `logos/real/de-specialiteit-pniel.webp` | Multi-location brand logo |
| De Boshut | deboshutrotterdam.nl | **YES** | `deboshutrotterdam.nl/wp-content/uploads/2025/08/favicon.png` | official site icon (round "DE BOS HUT" mark) | `logos/real/de-boshut.webp` | The horizontal header logo is cream-on-transparent and unreadable at card size; the name-bearing round mark is used instead |
| I Love Sushi | ilovesushi.nl | **YES** | `ilovesushi.nl/app/themes/lyfter-child/img/base/brand-logo.svg` | header logo (**SVG**) | `logos/real/i-love-sushi-kralingen.svg` | Chain brand logo; the Kralingen outlet has its own page on ilovesushi.nl; byte-identical SVG with white lettering, so shown on a dark tile |
| Van Stralen | etenbijvanstralen.nl | **YES** | `primary.jwwb.nl/…/gold-luxury-initial-circle-logo-high-n0h8un.png`, loaded by `etenbijvanstralen.nl` | header logo (PNG) from the site builder's media host | `logos/real/van-stralen.webp` | The file name suggests a logo-template origin, but the artwork reads "Van Stralen · Rotterdam Kralingen" and is the logo the official site shows |
| Curry's | currys.nl | **YES** | `currys.nl/assets/currys-logo.png` | header logo (PNG) | `logos/real/currys-kralingen.webp` | Yellow script; shown on a dark tile for contrast |
| Mama Licia | mammalicia.nl | **YES** | `mammalicia.nl/wp-content/uploads/2019/08/IMG_20190822_185924_465-300x300.jpg` | header logo image (JPG) | `logos/real/mama-licia.webp` | The logo reads "MAMMA LICIA" (domain mammalicia.nl); the dataset name "Mama Licia" comes from OpenStreetMap and is **left unchanged** |
| Macho Mama | macho-mama.nl | **NO** | — | — | — | The site's logo slot (`/tpl/template1/images/logo/logo_1.png`) is a **Thuisbezorgd** logo supplied by the platform-built site template, not Macho Mama's. The only Macho Mama logo on the page is hosted by Thuisbezorgd (`static.thuisbezorgd.nl/…/logo_465x320.png`): a third-party platform, excluded |
| Toko Smoor | tokosmoor.nl | **YES** | `tokosmoor.nl/wp-content/uploads/2025/09/TOKOSMOOR-NEWLOGO.png` | header logo (PNG) | `logos/real/toko-smoor.webp` | Current 2025 logo |
| The Commons | thesocialhub.co | **NO** | — | — | — | The official "Eat & Drink" page (rendered in a browser on 2026-09-30) **no longer mentions "The Commons"** and shows only The Social Hub's logo. Using the parent hotel brand's logo would misidentify the venue, and there's no Commons mark. Its name may need re-checking; not changed here |
| Maas | restaurant-maas.nl | **YES** | `static.wixstatic.com/media/2a9c32_f0f60feb…~mv2.png`, loaded by `restaurant-maas.nl` | header wordmark (PNG) from the site's own Wix media library | `logos/real/restaurant-maas.webp` | Gold "MAAS" wordmark |

"Loaded by" means the file lives on the CMS or site-builder media host that the restaurant's own page loads it from (Plate, Jouwweb, Wix). The page itself is on the restaurant's own domain.

## Fictional demo restaurants: 6 / 6

**FICTIONAL DEMO BRAND — ORIGINAL PROTOTYPE ASSET.** These are not official restaurant logos: the brands don't exist.

Each mark was drawn for this prototype on 2026-09-30:
- a rounded tile in the brand's existing colour with one white food glyph;
- no text, and no imitation of any real mark;
- no internet search was done for similarly named restaurants.

DEMO and integration labels are unchanged beside them.

| Demo restaurant | Glyph | Asset |
|---|---|---|
| FitKitchen | bowl with a leaf | `public/logos/demo/fitkitchen.svg` |
| Urban Bowl | bowl with chopsticks | `public/logos/demo/urbanbowl.svg` |
| Local Grill | flame over a grill | `public/logos/demo/localgrill.svg` |
| Pasta Metrica | fork with pasta | `public/logos/demo/pastametrica.svg` |
| Saffron & Steam | steaming bowl | `public/logos/demo/saffronsteam.svg` |
| Tinplate Deli | sandwich wedge | `public/logos/demo/tinplate.svg` |
