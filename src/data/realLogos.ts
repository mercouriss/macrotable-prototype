/*
 * Logos of REAL, unaffiliated restaurants — AUTHENTIC FIRST-PARTY ASSETS ONLY.
 * Full audit (all 19 venues, including why the remaining placeholders stay): docs/real-restaurant-logos.md
 *
 * An entry may exist only when:
 *   1. the file is the logo the restaurant (or its parent brand) itself publishes on its OWN official
 *      website — never a delivery platform, directory, search engine, social network or logo site;
 *   2. it is stored LOCALLY in public/logos/real/ (no runtime hotlinking) and unmodified: SVGs are
 *      byte-identical copies; rasters are only resized and re-encoded (no crop, recolour, redraw or trace);
 *   3. the exact page, asset URL and retrieval date are recorded below.
 * Using a logo from an official site does NOT establish a trademark licence, permission or partnership,
 * and nothing here claims one. A logo never replaces "Real · not affiliated" and never implies integration.
 * Fictional DEMO brands never use this registry.
 */

export type RealLogoSourceType =
  /** The logo the restaurant's own website uses in its header/navigation. */
  | "official-site-logo"
  /** The site's own icon, used because it is the restaurant's name-bearing identifying mark. */
  | "official-site-icon"
  /** The parent organisation's logo on its own site (the venue is operated under it). */
  | "parent-brand-site-logo";

export interface RealLogo {
  /** Local path under public/. */
  file: string;
  /** Official page (on the restaurant's own domain) where this logo is used. */
  pageUrl: string;
  /** Exact URL the file was downloaded from (the site itself or the CMS media host that page loads it from). */
  assetUrl: string;
  /** Hostname of pageUrl — the restaurant's (or parent brand's) own domain. */
  sourceDomain: string;
  sourceType: RealLogoSourceType;
  retrievedOn: string;
  /** What was done to the file: nothing but a byte copy, or resize + re-encode. */
  processing: string;
  /** Tile colour the logo was designed for (white/cream/yellow marks sit on a dark tile). */
  background: "light" | "dark";
  /** Width / height of the artwork, so wide wordmarks get a wider (never cropped) box. */
  aspect: number;
  usageBasis: typeof USAGE_BASIS;
  note?: string;
}

export const USAGE_BASIS =
  "Logo asset published on the restaurant's own official website, shown only to identify the venue. No trademark licence, permission or partnership with MacroTable has been established." as const;

const D = "2026-09-30";
const RESIZE = (w: number, lossy = false) => `resized to ${w}px wide, re-encoded as ${lossy ? "WebP (quality 88–90)" : "lossless WebP"}; artwork unchanged`;
const COPY = "byte-identical copy of the official SVG";

export const REAL_LOGOS: Record<string, RealLogo> = {
  "sallys-salads-eur": {
    file: "logos/real/sallys-salads-eur.webp",
    pageUrl: "https://sallyssalads.nl/",
    assetUrl: "https://sallyssalads.nl/wp-content/uploads/2024/08/Sallys_Salads_logo.png",
    sourceDomain: "sallyssalads.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(360),
    background: "dark",
    aspect: 4.14,
    usageBasis: USAGE_BASIS,
    note: "White wordmark with orange leaf; the site shows it on a dark header.",
  },
  "mozza-eur": {
    file: "logos/real/mozza-eur.webp",
    pageUrl: "https://mozzaeur.nl/",
    assetUrl: "https://mozzaeur.nl/wp-content/uploads/Mozza-Logo.png",
    sourceDomain: "mozzaeur.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(360, true) + " (original is a 7 MB 7076×3532 PNG)",
    background: "light",
    aspect: 2.0,
    usageBasis: USAGE_BASIS,
  },
  "erasmus-paviljoen": {
    file: "logos/real/erasmus-paviljoen.webp",
    pageUrl: "https://www.erasmuspaviljoen.nl/",
    assetUrl: "https://www.erasmuspaviljoen.nl/wp-content/uploads/2024/07/logo_groot.png",
    sourceDomain: "www.erasmuspaviljoen.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(480),
    background: "light",
    aspect: 8.57,
    usageBasis: USAGE_BASIS,
    note: "Very wide wordmark; the site also has a red striped-diamond icon (not name-bearing, not used).",
  },
  "tostiworld-eur": {
    file: "logos/real/tostiworld-eur.webp",
    pageUrl: "https://tostiworld.nl/",
    assetUrl: "https://tostiworld.nl/wp-content/themes/tostiworld/images/logo.png",
    sourceDomain: "tostiworld.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(320),
    background: "light",
    aspect: 2.19,
    usageBasis: USAGE_BASIS,
    note: "Chain brand logo; the dataset's Erasmus Food Plaza outlet is listed on the brand's own store page.",
  },
  "coffeecompany-eur": {
    file: "logos/real/coffeecompany-eur.svg",
    pageUrl: "https://coffeecompany.nl/",
    assetUrl: "https://coffeecompany.nl/assets/svg/logo-cbc777e65268d188423da08dce40515b5f1abb7b971558d5f9840c43246cd114.svg",
    sourceDomain: "coffeecompany.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: COPY,
    background: "light",
    aspect: 5.78,
    usageBasis: USAGE_BASIS,
    note: "Chain brand logo (the Burgemeester Oudlaan 50 location is on the brand's own location page).",
  },
  "erasmus-sport-cafe": {
    file: "logos/real/erasmus-sport-cafe.webp",
    pageUrl: "https://erasmussport.nl/",
    assetUrl: "https://erasmussport.nl/wp-content/uploads/2020/05/Logo_Erasmus_Sport_2019_RGB-1.png",
    sourceDomain: "erasmussport.nl",
    sourceType: "parent-brand-site-logo",
    retrievedOn: D,
    processing: RESIZE(320),
    background: "light",
    aspect: 1.98,
    usageBasis: USAGE_BASIS,
    note: "Erasmus Sport's logo: the café is part of Erasmus Sport (its address is on erasmussport.nl). No café-specific mark exists.",
  },
  "restobar-colette": {
    file: "logos/real/restobar-colette.svg",
    pageUrl: "https://coletterotterdam.nl/",
    assetUrl: "https://coletterotterdam.nl/_webblocks/images/colette_logo.svg",
    sourceDomain: "coletterotterdam.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: COPY,
    background: "light",
    aspect: 2.52,
    usageBasis: USAGE_BASIS,
    note: "The same site also serves an 'Osteria Vicini' logo (logo.svg) — a different restaurant, deliberately not used.",
  },
  "cafe-stobbe": {
    file: "logos/real/cafe-stobbe.svg",
    pageUrl: "https://cafestobbe.nl/",
    assetUrl: "https://cafestobbe.nl/wp-content/uploads/2019/08/Logo-Stobbe-Wit.svg",
    sourceDomain: "cafestobbe.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: COPY,
    background: "dark",
    aspect: 2.27,
    usageBasis: USAGE_BASIS,
    note: "The official SVG is white ('Wit'); shown on a dark tile rather than recoloured.",
  },
  "de-specialiteit-pniel": {
    file: "logos/real/de-specialiteit-pniel.webp",
    pageUrl: "https://www.despecialiteit.nl/locatie/pniel",
    assetUrl: "https://prod1-plate-attachments.s3.amazonaws.com/images/db26aa44d9/logo%20de%20specialiteit%20groen%20RGB.png",
    sourceDomain: "www.despecialiteit.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(480),
    background: "light",
    aspect: 4.85,
    usageBasis: USAGE_BASIS,
    note: "Brand logo of the multi-location De Specialiteit; the file is served from the site's own CMS (Plate) media storage.",
  },
  "de-boshut": {
    file: "logos/real/de-boshut.webp",
    pageUrl: "https://deboshutrotterdam.nl/",
    assetUrl: "https://deboshutrotterdam.nl/wp-content/uploads/2025/08/favicon.png",
    sourceDomain: "deboshutrotterdam.nl",
    sourceType: "official-site-icon",
    retrievedOn: D,
    processing: "lossless WebP re-encode at the original 150×150; artwork unchanged",
    background: "light",
    aspect: 1.0,
    usageBasis: USAGE_BASIS,
    note: "Round 'DE BOS HUT' mark. The horizontal header logo is cream-on-transparent (deboshut_logo_creme_liggend.png) and illegible at card size.",
  },
  "i-love-sushi-kralingen": {
    file: "logos/real/i-love-sushi-kralingen.svg",
    pageUrl: "https://ilovesushi.nl/",
    assetUrl: "https://ilovesushi.nl/app/themes/lyfter-child/img/base/brand-logo.svg",
    sourceDomain: "ilovesushi.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: COPY,
    background: "dark",
    aspect: 2.95,
    usageBasis: USAGE_BASIS,
    note: "Chain brand logo; the Kralingen outlet (Lusthofstraat 70B) has its own location page on ilovesushi.nl. White lettering with a red heart — shown on a dark tile, not recoloured.",
  },
  "van-stralen": {
    file: "logos/real/van-stralen.webp",
    pageUrl: "https://www.etenbijvanstralen.nl/",
    assetUrl: "https://primary.jwwb.nl/public/o/w/z/temp-kbgdqcsdgixkeqkyjcds/gold-luxury-initial-circle-logo-high-n0h8un.png",
    sourceDomain: "www.etenbijvanstralen.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(200),
    background: "light",
    aspect: 1.0,
    usageBasis: USAGE_BASIS,
    note: "The file name suggests a logo-template origin, but the artwork carries 'Van Stralen · Rotterdam Kralingen' and is the logo the official site shows (served from its site builder's media host).",
  },
  "currys-kralingen": {
    file: "logos/real/currys-kralingen.webp",
    pageUrl: "https://www.currys.nl/",
    assetUrl: "https://www.currys.nl/assets/currys-logo.png",
    sourceDomain: "www.currys.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(320),
    background: "dark",
    aspect: 2.81,
    usageBasis: USAGE_BASIS,
    note: "Yellow script; low contrast on white, so shown on a dark tile.",
  },
  "mama-licia": {
    file: "logos/real/mama-licia.webp",
    pageUrl: "https://mammalicia.nl/",
    assetUrl: "https://mammalicia.nl/wp-content/uploads/2019/08/IMG_20190822_185924_465-300x300.jpg",
    sourceDomain: "mammalicia.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: "resized to 200px, re-encoded as WebP (quality 90); artwork unchanged",
    background: "light",
    aspect: 1.0,
    usageBasis: USAGE_BASIS,
    note: "The site's logo image reads 'MAMMA LICIA' (domain mammalicia.nl); the dataset name 'Mama Licia' comes from OpenStreetMap and is left unchanged.",
  },
  "toko-smoor": {
    file: "logos/real/toko-smoor.webp",
    pageUrl: "https://tokosmoor.nl/",
    assetUrl: "https://tokosmoor.nl/wp-content/uploads/2025/09/TOKOSMOOR-NEWLOGO.png",
    sourceDomain: "tokosmoor.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(400),
    background: "light",
    aspect: 3.54,
    usageBasis: USAGE_BASIS,
  },
  "restaurant-maas": {
    file: "logos/real/restaurant-maas.webp",
    pageUrl: "https://www.restaurant-maas.nl/",
    assetUrl: "https://static.wixstatic.com/media/2a9c32_f0f60febfc4748e7a1431dbfa08817c8~mv2.png",
    sourceDomain: "www.restaurant-maas.nl",
    sourceType: "official-site-logo",
    retrievedOn: D,
    processing: RESIZE(400),
    background: "light",
    aspect: 4.4,
    usageBasis: USAGE_BASIS,
    note: "Gold 'MAAS' wordmark the official (Wix-built) site loads from its own Wix media library.",
  },
  "lokanta-proeflokaal": {
    file: "logos/real/lokanta-proeflokaal.webp",
    pageUrl: "https://lokanta-proeflokaal.nl/", // the page's rel=canonical
    assetUrl: "https://www.lokanta-proeflokaal.nl/_astro/lokantaproeflokaal.DsuDs63m.png",
    sourceDomain: "lokanta-proeflokaal.nl",
    sourceType: "official-site-logo",
    retrievedOn: "2026-10-03",
    processing: RESIZE(360),
    background: "light",
    aspect: 2.8,
    usageBasis: USAGE_BASIS,
    note: "Teal mark and 'LOKANTA PROEFLOKAAL' wordmark from the site's header (alt text 'Lokanta Proeflokaal Logo'). The site was disabled (HTTP 402) on 2026-09-30 and is live again.",
  },
};
