import type { ModifierOption, Nutrition, Restaurant, RestaurantLogo } from "../types";
import { DEMO_STORE_LOCATIONS } from "./geo";
import { REAL_LOGOS } from "./realLogos";

/*
 * DEMO BRANDS ARE FICTIONAL MOCK DATA for a university prototype: their
 * recipes, prices and nutrition values are invented. Real restaurants at the
 * bottom carry identity + location only. Deltas are
 * chosen so that every configuration sums exactly (see optimizer tests).
 *
 * Nutrition deltas are relative to the dish as listed (the default option of
 * each group has a zero delta).
 */

const n = (calories: number, protein: number, carbs: number, fat: number): Nutrition => ({
  calories,
  protein,
  carbs,
  fat,
});
const ZERO = n(0, 0, 0, 0);

const opt = (
  id: string,
  label: string,
  priceDelta: number,
  nutritionDelta: Nutrition,
  ticketLabel?: string,
  supported = true,
): ModifierOption => ({ id, label, priceDelta, nutritionDelta, ticketLabel, supported });

const unsupported = (id: string, label: string): ModifierOption => opt(id, label, 0, ZERO, undefined, false);

/** FICTIONAL DEMO BRAND — ORIGINAL PROTOTYPE ASSET (public/logos/demo). Not an official restaurant logo. Presentation only. */
const demoLogo = (id: string, name: string): RestaurantLogo => ({ src: `logos/demo/${id}.svg`, alt: `${name} logo (fictional demo brand)`, source: "demo-original" });

// ─── Level 3 · Verified MacroTable partner ─────────────────────────────────
const fitKitchen: Restaurant = {
  id: "fitkitchen",
  identity: "demo",
  name: "FitKitchen",
  integrationLevel: 3,
  cuisine: "Protein bowls",
  tagline: "Verified recipes · chef-approved modifications",
  location: DEMO_STORE_LOCATIONS.fitkitchen,
  address: "Fictional demo store A",
  priceRange: "€€",
  serviceModes: ["pickup", "in-store"],
  pickupMinutes: 12,
  brand: { color: "#1E6B52", mark: "FK" },
  logo: demoLogo("fitkitchen", "FitKitchen"),
  meals: [
    {
      id: "fk-chicken-power-bowl",
      restaurantId: "fitkitchen",
      name: "Chicken Power Bowl",
      description: "Grilled chicken thigh, jasmine rice, roasted vegetables and sesame-miso sauce.",
      price: 14.5,
      nutrition: n(890, 39, 105, 31),
      provenance: "verified",
      available: true,
      dietaryTags: ["high-protein"],
      palette: ["#E9D9B6", "#C98F5A", "#6F9A5B", "#D8B35A"],
      modifierGroups: [
        {
          id: "chicken",
          name: "Chicken",
          defaultOptionId: "chicken-std",
          options: [
            opt("chicken-std", "Standard", 0, ZERO),
            opt("chicken-50", "+50 g", 1.5, n(70, 12, 0, 2), "EXTRA CHICKEN (+50g)"),
            opt("chicken-100", "+100 g", 3.0, n(150, 24, 0, 5), "EXTRA CHICKEN (+100g)"),
          ],
        },
        {
          id: "rice",
          name: "Rice",
          defaultOptionId: "rice-std",
          options: [
            opt("rice-none", "None", 0, n(-320, -6, -70, -1), "NO RICE"),
            opt("rice-half", "Half", 0, n(-160, -3, -35, 0), "HALF RICE"),
            opt("rice-std", "Standard", 0, ZERO),
            unsupported("rice-cauli", "Cauliflower rice swap"),
          ],
        },
        {
          id: "sauce",
          name: "Sauce",
          defaultOptionId: "sauce-std",
          options: [
            opt("sauce-none", "None", 0, n(-296, -2, -6, -26), "NO SAUCE"),
            opt("sauce-light", "Light", 0, n(-148, -1, -3, -13), "LIGHT SAUCE"),
            opt("sauce-std", "Standard", 0, ZERO),
            unsupported("sauce-side", "Sauce on the side"),
          ],
        },
        {
          id: "veg",
          name: "Vegetables",
          defaultOptionId: "veg-std",
          options: [
            opt("veg-std", "Standard", 0, ZERO),
            opt("veg-double", "Double", 0.5, n(30, 2, 5, 0), "DOUBLE VEGETABLES"),
          ],
        },
      ],
    },
    {
      id: "fk-salmon-quinoa",
      restaurantId: "fitkitchen",
      name: "Salmon & Quinoa Plate",
      description: "Roasted salmon fillet, herbed quinoa, greens and lemon-yoghurt dressing.",
      price: 16.9,
      nutrition: n(760, 42, 58, 38),
      provenance: "verified",
      available: true,
      dietaryTags: ["pescatarian", "high-protein"],
      palette: ["#F2C6A8", "#E0915F", "#A7C08A", "#EFE6D2"],
      modifierGroups: [
        {
          id: "salmon",
          name: "Salmon",
          defaultOptionId: "salmon-std",
          options: [
            opt("salmon-std", "Standard", 0, ZERO),
            opt("salmon-50", "+50 g", 2.5, n(105, 11, 0, 7), "EXTRA SALMON (+50g)"),
          ],
        },
        {
          id: "quinoa",
          name: "Quinoa",
          defaultOptionId: "quinoa-std",
          options: [
            opt("quinoa-half", "Half", 0, n(-110, -4, -19, -2), "HALF QUINOA"),
            opt("quinoa-std", "Standard", 0, ZERO),
          ],
        },
        {
          id: "dressing",
          name: "Dressing",
          defaultOptionId: "dressing-std",
          options: [
            opt("dressing-none", "None", 0, n(-140, 0, -2, -15), "NO DRESSING"),
            opt("dressing-light", "Light", 0, n(-70, 0, -1, -8), "LIGHT DRESSING"),
            opt("dressing-std", "Standard", 0, ZERO),
          ],
        },
        {
          id: "greens",
          name: "Greens",
          defaultOptionId: "greens-std",
          options: [
            opt("greens-std", "Standard", 0, ZERO),
            opt("greens-double", "Double", 0.5, n(20, 1, 3, 0), "DOUBLE GREENS"),
          ],
        },
      ],
    },
    {
      id: "fk-tofu-tahini",
      restaurantId: "fitkitchen",
      name: "Crispy Tofu Tahini Bowl",
      description: "Crispy tofu, freekeh, roasted squash, pickled cabbage and tahini.",
      price: 13.5,
      nutrition: n(640, 30, 70, 28),
      provenance: "verified",
      available: true,
      dietaryTags: ["vegetarian", "vegan"],
      palette: ["#EADFC4", "#D9A441", "#B0715C", "#8DAA6A"],
      modifierGroups: [
        {
          id: "tofu",
          name: "Tofu",
          defaultOptionId: "tofu-std",
          options: [
            opt("tofu-std", "Standard", 0, ZERO),
            opt("tofu-75", "+75 g", 2.0, n(110, 12, 3, 7), "EXTRA TOFU (+75g)"),
          ],
        },
        {
          id: "grains",
          name: "Freekeh",
          defaultOptionId: "grains-std",
          options: [
            opt("grains-half", "Half", 0, n(-100, -3, -20, -1), "HALF FREEKEH"),
            opt("grains-std", "Standard", 0, ZERO),
          ],
        },
        {
          id: "tahini",
          name: "Tahini",
          defaultOptionId: "tahini-std",
          options: [
            opt("tahini-light", "Light", 0, n(-60, -2, -2, -5), "LIGHT TAHINI"),
            opt("tahini-std", "Standard", 0, ZERO),
          ],
        },
        {
          id: "edamame",
          name: "Edamame",
          defaultOptionId: "edamame-none",
          options: [
            opt("edamame-none", "None", 0, ZERO),
            opt("edamame-add", "Add", 1.5, n(90, 8, 6, 4), "ADD EDAMAME"),
          ],
        },
      ],
    },
    {
      id: "fk-steak-sweet-potato",
      restaurantId: "fitkitchen",
      name: "Steak & Sweet Potato",
      description: "Flank steak, roasted sweet potato, chimichurri and charred greens.",
      price: 17.9,
      nutrition: n(720, 48, 62, 28),
      provenance: "verified",
      available: false,
      unavailableReason: "Sold out tonight",
      dietaryTags: ["high-protein"],
      palette: ["#B5634B", "#E5A064", "#7C9A58", "#EAD9BF"],
      modifierGroups: [],
    },
  ],
};

// ─── Level 2 · Structured integration (official nutrition) ────────────────
const urbanBowl: Restaurant = {
  id: "urbanbowl",
  identity: "demo",
  name: "Urban Bowl",
  integrationLevel: 2,
  cuisine: "Build-your-own bowls",
  tagline: "Official nutrition · structured menu",
  location: DEMO_STORE_LOCATIONS.urbanbowl,
  address: "Fictional demo store B",
  priceRange: "€€",
  serviceModes: ["pickup", "in-store"],
  pickupMinutes: 15,
  brand: { color: "#2A4B7F", mark: "UB" },
  logo: demoLogo("urbanbowl", "Urban Bowl"),
  meals: [
    {
      id: "ub-teriyaki-salmon",
      restaurantId: "urbanbowl",
      name: "Teriyaki Salmon Bowl",
      description: "Teriyaki-glazed salmon, sushi rice, cucumber, carrot and sesame.",
      price: 16.2,
      nutrition: n(780, 34, 90, 27),
      provenance: "official",
      available: true,
      dietaryTags: ["pescatarian"],
      palette: ["#F1EADB", "#E98A5B", "#8FB573", "#3F3A36"],
      modifierGroups: [
        {
          id: "protein",
          name: "Salmon",
          defaultOptionId: "protein-std",
          options: [opt("protein-std", "Standard", 0, ZERO), unsupported("protein-extra", "Extra salmon")],
        },
        {
          id: "rice",
          name: "Rice",
          defaultOptionId: "rice-std",
          options: [opt("rice-std", "Standard", 0, ZERO), unsupported("rice-half", "Half rice")],
        },
        {
          id: "sauce",
          name: "Teriyaki sauce",
          defaultOptionId: "sauce-std",
          options: [
            opt("sauce-light", "Light", 0, n(-80, 0, -14, -3), "LIGHT SAUCE"),
            opt("sauce-std", "Standard", 0, ZERO),
            opt("sauce-extra", "Extra", 0.5, n(80, 0, 14, 3), "EXTRA SAUCE"),
          ],
        },
        {
          id: "addon",
          name: "Add-on",
          defaultOptionId: "addon-none",
          options: [
            opt("addon-none", "None", 0, ZERO),
            opt("addon-edamame", "Edamame", 1.0, n(60, 6, 4, 3), "ADD EDAMAME"),
            opt("addon-avocado", "Avocado", 1.5, n(80, 1, 2, 8), "ADD AVOCADO"),
          ],
        },
      ],
    },
    {
      id: "ub-chipotle-chicken",
      restaurantId: "urbanbowl",
      name: "Chipotle Chicken Burrito Bowl",
      description: "Chipotle chicken, lime rice, black beans, cheese, sour cream and salsa.",
      price: 13.9,
      nutrition: n(850, 38, 92, 34),
      provenance: "official",
      available: true,
      dietaryTags: ["spicy"],
      palette: ["#E4C79A", "#B8502F", "#3B3230", "#F3E3B0"],
      modifierGroups: [
        {
          id: "protein",
          name: "Chicken",
          defaultOptionId: "protein-std",
          options: [
            opt("protein-std", "Standard", 0, ZERO),
            opt("protein-double", "Double", 4.5, n(160, 30, 2, 6), "DOUBLE CHICKEN"),
          ],
        },
        {
          id: "rice",
          name: "Rice",
          defaultOptionId: "rice-std",
          options: [
            opt("rice-light", "Light", 0, n(-100, -2, -22, 0), "LIGHT RICE"),
            opt("rice-std", "Standard", 0, ZERO),
          ],
        },
        {
          id: "cheese",
          name: "Cheese",
          defaultOptionId: "cheese-std",
          options: [opt("cheese-none", "None", 0, n(-110, -7, 0, -9), "NO CHEESE"), opt("cheese-std", "Standard", 0, ZERO)],
        },
        {
          id: "sourcream",
          name: "Sour cream",
          defaultOptionId: "sourcream-std",
          options: [
            opt("sourcream-none", "None", 0, n(-60, -1, -2, -6), "NO SOUR CREAM"),
            opt("sourcream-std", "Standard", 0, ZERO),
          ],
        },
      ],
    },
    {
      id: "ub-falafel-halloumi",
      restaurantId: "urbanbowl",
      name: "Falafel & Halloumi Bowl",
      description: "Baked falafel, grilled halloumi, bulgur, hummus and herb dressing.",
      price: 13.5,
      nutrition: n(820, 26, 84, 40),
      provenance: "official",
      available: true,
      dietaryTags: ["vegetarian"],
      palette: ["#D9B36C", "#8A6A3B", "#F4EAD5", "#7FA36A"],
      modifierGroups: [
        {
          id: "halloumi",
          name: "Halloumi",
          defaultOptionId: "halloumi-std",
          options: [
            opt("halloumi-none", "None", 0, n(-120, -8, -1, -9), "NO HALLOUMI"),
            opt("halloumi-std", "Standard", 0, ZERO),
            opt("halloumi-extra", "Extra", 2.0, n(120, 8, 1, 9), "EXTRA HALLOUMI"),
          ],
        },
        {
          id: "hummus",
          name: "Hummus",
          defaultOptionId: "hummus-std",
          options: [opt("hummus-light", "Light", 0, n(-60, -2, -4, -4), "LIGHT HUMMUS"), opt("hummus-std", "Standard", 0, ZERO)],
        },
        {
          id: "dressing",
          name: "Dressing",
          defaultOptionId: "dressing-std",
          options: [
            opt("dressing-light", "Light", 0, n(-70, 0, -2, -7), "LIGHT DRESSING"),
            opt("dressing-std", "Standard", 0, ZERO),
          ],
        },
      ],
    },
  ],
};

// ─── Level 1 · Unaffiliated (estimated from a public menu) ────────────────
const localGrill: Restaurant = {
  id: "localgrill",
  identity: "demo",
  name: "Local Grill",
  integrationLevel: 1,
  cuisine: "Grill & wraps",
  tagline: "Public menu only · estimated nutrition",
  location: DEMO_STORE_LOCATIONS.localgrill,
  address: "Fictional demo store C",
  priceRange: "€",
  serviceModes: ["in-store"],
  pickupMinutes: 10,
  brand: { color: "#8A5A2B", mark: "LG" },
  logo: demoLogo("localgrill", "Local Grill"),
  meals: [
    {
      id: "lg-chicken-salad",
      restaurantId: "localgrill",
      name: "Grilled Chicken Salad",
      description: "Grilled chicken, mixed leaves, tomato, feta and olive-oil dressing.",
      price: 12.5,
      nutrition: n(520, 44, 22, 28),
      provenance: "estimated",
      available: true,
      dietaryTags: [],
      palette: ["#9CBF73", "#E7C9A0", "#D65A43", "#F3F0E4"],
      modifierGroups: [],
    },
    {
      id: "lg-souvlaki-plate",
      restaurantId: "localgrill",
      name: "Chicken Souvlaki Plate",
      description: "Chicken skewers, fries, pita and tzatziki.",
      price: 15.0,
      nutrition: n(980, 52, 88, 46),
      provenance: "estimated",
      available: true,
      dietaryTags: [],
      palette: ["#E8C27A", "#C0874F", "#F4EFE3", "#9DB77B"],
      modifierGroups: [],
    },
    {
      id: "lg-halloumi-wrap",
      restaurantId: "localgrill",
      name: "Halloumi Veggie Wrap",
      description: "Grilled halloumi, peppers, rocket and harissa mayo in a flatbread.",
      price: 11.0,
      nutrition: n(690, 28, 70, 34),
      provenance: "estimated",
      available: true,
      dietaryTags: ["vegetarian", "spicy"],
      palette: ["#E9D2A4", "#C9573C", "#7EA15F", "#F5ECD8"],
      modifierGroups: [],
    },
    {
      id: "lg-daily-special",
      restaurantId: "localgrill",
      name: "Chef's Daily Special",
      description: "Changes daily — ask the restaurant.",
      price: 14.0,
      nutrition: null,
      provenance: "insufficient",
      available: true,
      dietaryTags: [],
      palette: ["#D8CFC0", "#B7AA95", "#EDE7DC", "#A39883"],
      modifierGroups: [],
    },
  ],
};

// ─── Public-only demo brands (NOT in the frozen study dataset) ────────────
/*
 * Added in V3.5 so Explore and MacroAgent can compare across cuisines and price
 * points. They are fictional (names checked against local businesses on
 * 2026-09-29) and are never shown during research trials or in /baseline.
 */

// Level 3 · deep demo integration
const pastaMetrica: Restaurant = {
  id: "pastametrica",
  identity: "demo",
  name: "Pasta Metrica",
  integrationLevel: 3,
  cuisine: "Fresh pasta",
  tagline: "Verified recipes · portion-level changes",
  location: DEMO_STORE_LOCATIONS.pastametrica,
  address: "Fictional demo store D",
  priceRange: "€€",
  serviceModes: ["pickup", "in-store"],
  pickupMinutes: 14,
  brand: { color: "#A8432F", mark: "PM" },
  logo: demoLogo("pastametrica", "Pasta Metrica"),
  meals: [
    {
      id: "pm-chicken-pesto-penne",
      restaurantId: "pastametrica",
      name: "Chicken Pesto Penne",
      description: "Penne, grilled chicken, basil pesto, cherry tomatoes and parmesan.",
      price: 14.9,
      nutrition: n(820, 44, 88, 32),
      provenance: "verified",
      available: true,
      dietaryTags: ["high-protein"],
      palette: ["#EAD8A6", "#6E9A4A", "#D9573C", "#F4EBD2"],
      modifierGroups: [
        {
          id: "pasta",
          name: "Pasta",
          defaultOptionId: "pasta-std",
          options: [
            opt("pasta-half", "Half", 0, n(-210, -7, -42, -1), "HALF PASTA"),
            opt("pasta-std", "Standard", 0, ZERO),
            opt("pasta-extra", "Extra", 1.5, n(210, 7, 42, 1), "EXTRA PASTA"),
            unsupported("pasta-gf", "Gluten-free pasta"),
          ],
        },
        {
          id: "chicken",
          name: "Chicken",
          defaultOptionId: "chicken-std",
          options: [
            opt("chicken-std", "Standard", 0, ZERO),
            opt("chicken-60", "+60 g", 2.0, n(90, 16, 0, 3), "EXTRA CHICKEN (+60g)"),
          ],
        },
        {
          id: "pesto",
          name: "Pesto",
          defaultOptionId: "pesto-std",
          options: [
            opt("pesto-light", "Light", 0, n(-90, -1, -1, -10), "LIGHT PESTO"),
            opt("pesto-std", "Standard", 0, ZERO),
            unsupported("pesto-side", "Pesto on the side"),
          ],
        },
        {
          id: "parmesan",
          name: "Parmesan",
          defaultOptionId: "parmesan-std",
          options: [opt("parmesan-none", "None", 0, n(-40, -3, 0, -3), "NO PARMESAN"), opt("parmesan-std", "Standard", 0, ZERO)],
        },
      ],
    },
    {
      id: "pm-turkey-bolognese",
      restaurantId: "pastametrica",
      name: "Turkey Bolognese Rigatoni",
      description: "Rigatoni with slow-cooked turkey ragù and parmesan.",
      price: 13.5,
      nutrition: n(760, 42, 92, 22),
      provenance: "verified",
      available: true,
      dietaryTags: ["high-protein"],
      palette: ["#E3C48A", "#B5452C", "#F2E6CF", "#8E3B26"],
      modifierGroups: [
        {
          id: "pasta",
          name: "Pasta",
          defaultOptionId: "pasta-std",
          options: [opt("pasta-half", "Half", 0, n(-210, -7, -42, -1), "HALF PASTA"), opt("pasta-std", "Standard", 0, ZERO)],
        },
        {
          id: "ragu",
          name: "Ragù",
          defaultOptionId: "ragu-std",
          options: [opt("ragu-std", "Standard", 0, ZERO), opt("ragu-extra", "Extra", 2.0, n(120, 12, 6, 5), "EXTRA RAGU")],
        },
        {
          id: "parmesan",
          name: "Parmesan",
          defaultOptionId: "parmesan-std",
          options: [opt("parmesan-none", "None", 0, n(-40, -3, 0, -3), "NO PARMESAN"), opt("parmesan-std", "Standard", 0, ZERO)],
        },
      ],
    },
    {
      id: "pm-roasted-veg-orzo",
      restaurantId: "pastametrica",
      name: "Roasted Veg Orzo",
      description: "Orzo with roasted peppers, courgette, feta and lemon-herb oil.",
      price: 12.5,
      nutrition: n(640, 22, 86, 22),
      provenance: "verified",
      available: true,
      dietaryTags: ["vegetarian"],
      palette: ["#EFE3C2", "#D9812F", "#7FA35B", "#F7F1E4"],
      modifierGroups: [
        {
          id: "orzo",
          name: "Orzo",
          defaultOptionId: "orzo-std",
          options: [opt("orzo-half", "Half", 0, n(-180, -6, -36, -1), "HALF ORZO"), opt("orzo-std", "Standard", 0, ZERO)],
        },
        {
          id: "chickpeas",
          name: "Chickpeas",
          defaultOptionId: "chickpeas-none",
          options: [opt("chickpeas-none", "None", 0, ZERO), opt("chickpeas-add", "Add", 1.0, n(120, 7, 18, 2), "ADD CHICKPEAS")],
        },
        {
          id: "feta",
          name: "Feta",
          defaultOptionId: "feta-std",
          options: [opt("feta-none", "None", 0, n(-80, -5, -1, -6), "NO FETA"), opt("feta-std", "Standard", 0, ZERO)],
        },
      ],
    },
  ],
};

// Level 2 · structured demo integration
const saffronSteam: Restaurant = {
  id: "saffronsteam",
  identity: "demo",
  name: "Saffron & Steam",
  integrationLevel: 2,
  cuisine: "Indian rice bowls",
  tagline: "Official nutrition · structured menu",
  location: DEMO_STORE_LOCATIONS.saffronsteam,
  address: "Fictional demo store E",
  priceRange: "€",
  serviceModes: ["pickup", "in-store"],
  pickupMinutes: 11,
  brand: { color: "#B7791F", mark: "S&S" },
  logo: demoLogo("saffronsteam", "Saffron & Steam"),
  meals: [
    {
      id: "ss-chicken-tikka-bowl",
      restaurantId: "saffronsteam",
      name: "Chicken Tikka Rice Bowl",
      description: "Tandoori-spiced chicken, basmati rice, charred onions and mint raita.",
      price: 12.9,
      nutrition: n(790, 42, 96, 24),
      provenance: "official",
      available: true,
      dietaryTags: ["high-protein", "spicy"],
      palette: ["#F1DFA8", "#C8562E", "#8BAE6B", "#F6F1E6"],
      modifierGroups: [
        {
          id: "rice",
          name: "Rice",
          defaultOptionId: "rice-std",
          options: [
            opt("rice-half", "Half", 0, n(-170, -3, -37, 0), "HALF RICE"),
            opt("rice-std", "Standard", 0, ZERO),
            unsupported("rice-cauli", "Cauliflower rice"),
          ],
        },
        {
          id: "chicken",
          name: "Chicken",
          defaultOptionId: "chicken-std",
          options: [opt("chicken-std", "Standard", 0, ZERO), opt("chicken-extra", "Extra", 3.0, n(120, 22, 2, 3), "EXTRA CHICKEN")],
        },
        {
          id: "raita",
          name: "Raita",
          defaultOptionId: "raita-std",
          options: [opt("raita-none", "None", 0, n(-50, -2, -3, -3), "NO RAITA"), opt("raita-std", "Standard", 0, ZERO)],
        },
      ],
    },
    {
      id: "ss-chana-masala",
      restaurantId: "saffronsteam",
      name: "Chana Masala Bowl",
      description: "Chickpea and tomato curry, basmati rice, pickled onion and coriander.",
      price: 10.5,
      nutrition: n(680, 20, 104, 18),
      provenance: "official",
      available: true,
      dietaryTags: ["vegetarian", "vegan"],
      palette: ["#E8C27A", "#B8532F", "#F3EAD3", "#6F9A5B"],
      modifierGroups: [
        {
          id: "rice",
          name: "Rice",
          defaultOptionId: "rice-std",
          options: [opt("rice-half", "Half", 0, n(-170, -3, -37, 0), "HALF RICE"), opt("rice-std", "Standard", 0, ZERO)],
        },
        {
          id: "tofu",
          name: "Tofu",
          defaultOptionId: "tofu-none",
          options: [opt("tofu-none", "None", 0, ZERO), opt("tofu-add", "Add", 2.0, n(110, 12, 3, 6), "ADD TOFU")],
        },
      ],
    },
    {
      id: "ss-lamb-rogan-josh",
      restaurantId: "saffronsteam",
      name: "Lamb Rogan Josh",
      description: "Slow-cooked lamb curry with basmati rice and naan.",
      price: 15.5,
      nutrition: n(960, 44, 98, 42),
      provenance: "official",
      available: true,
      dietaryTags: ["spicy"],
      palette: ["#9E3B22", "#E7C98E", "#F4EDDD", "#6B3322"],
      modifierGroups: [
        {
          id: "naan",
          name: "Naan",
          defaultOptionId: "naan-std",
          options: [opt("naan-none", "None", -1.0, n(-260, -8, -44, -6), "NO NAAN"), opt("naan-std", "Standard", 0, ZERO)],
        },
      ],
    },
  ],
};

// Level 1 · not integrated (estimated from a public menu)
const tinplateDeli: Restaurant = {
  id: "tinplate",
  identity: "demo",
  name: "Tinplate Deli",
  integrationLevel: 1,
  cuisine: "Sandwiches & soup",
  tagline: "Public menu only · estimated nutrition",
  location: DEMO_STORE_LOCATIONS.tinplate,
  address: "Fictional demo store F",
  priceRange: "€",
  serviceModes: ["in-store"],
  pickupMinutes: 8,
  brand: { color: "#4B5563", mark: "TD" },
  logo: demoLogo("tinplate", "Tinplate Deli"),
  meals: [
    {
      id: "td-turkey-avocado-rye",
      restaurantId: "tinplate",
      name: "Turkey & Avocado Rye",
      description: "Roast turkey, avocado, tomato and mustard mayo on rye.",
      price: 9.5,
      nutrition: n(560, 34, 52, 22),
      provenance: "estimated",
      available: true,
      dietaryTags: [],
      palette: ["#8C6A4A", "#9CBF73", "#E7D1B0", "#D65A43"],
      modifierGroups: [],
    },
    {
      id: "td-tuna-melt",
      restaurantId: "tinplate",
      name: "Tuna Melt",
      description: "Tuna, red onion and cheddar, toasted on sourdough.",
      price: 9.0,
      nutrition: n(690, 36, 54, 34),
      provenance: "estimated",
      available: true,
      dietaryTags: ["pescatarian"],
      palette: ["#E6C58A", "#F2E3BE", "#C9A15A", "#B0703C"],
      modifierGroups: [],
    },
    {
      id: "td-soup-of-the-day",
      restaurantId: "tinplate",
      name: "Soup of the Day & Bread",
      description: "Changes daily — ask at the counter.",
      price: 7.5,
      nutrition: null,
      provenance: "insufficient",
      available: true,
      dietaryTags: [],
      palette: ["#D8CFC0", "#B7AA95", "#EDE7DC", "#A39883"],
      modifierGroups: [],
    },
  ],
};

// ─── REAL restaurants (identity + location only) ──────────────────────────
/*
 * Each one verified 2026-09-29: the restaurant's own website was live and
 * stated this address, and the location matches the OpenStreetMap object.
 * We claim NOTHING else: no partnership, API, menu, prices, nutrition, hours
 * or ordering. `cuisine` is a neutral category from the OSM tag / own site.
 * MacroTable treats them as unaffiliated and can only help by reading a menu
 * photo the user takes.
 */
const VERIFIED_ON = "2026-09-29";

const realRestaurant = (
  id: string,
  name: string,
  cuisine: string,
  [lat, lng]: [number, number],
  website: string,
  addressLine: string,
  osm: string,
): Restaurant => ({
  id,
  identity: "real",
  real: {
    website,
    addressLine,
    osm,
    verifiedOn: VERIFIED_ON,
    sources: [`${new URL(website).hostname.replace(/^www\./, "")} (own website, address checked)`, `OpenStreetMap ${osm}`],
  },
  name,
  integrationLevel: 1,
  cuisine,
  tagline: "Real restaurant · not affiliated with MacroTable",
  location: { lat, lng },
  address: addressLine,
  serviceModes: [],
  // A real venue's logo only as an authentic first-party asset with recorded provenance (see realLogos.ts); else none.
  ...(REAL_LOGOS[id]
    ? { logo: { src: REAL_LOGOS[id].file, alt: `${name} logo`, source: "real-official-site" as const, aspect: REAL_LOGOS[id].aspect, background: REAL_LOGOS[id].background } }
    : {}),
  meals: [],
});

const REAL_RESTAURANTS: Restaurant[] = [
  // Erasmus University campus (Woudestein)
  realRestaurant("sallys-salads-eur", "Sally's Salads", "Salads", [51.91666, 4.52559], "https://sallyssalads.nl/", "Foodcourt Erasmus Universiteit, Burgemeester Oudlaan 50, Rotterdam", "node/4140102516"),
  realRestaurant("mozza-eur", "Mozza", "Mediterranean", [51.91688, 4.52547], "https://mozzaeur.nl/", "Erasmus Food Plaza, Burgemeester Oudlaan 50, Rotterdam", "node/4140102517"),
  realRestaurant("erasmus-paviljoen", "Erasmus Paviljoen", "Italian", [51.91734, 4.5258], "https://www.erasmuspaviljoen.nl/", "Burgemeester Oudlaan 350 (Gebouw X), Rotterdam", "node/4003342398"),
  realRestaurant("tostiworld-eur", "Tosti World", "Toasties", [51.91664, 4.52578], "https://tostiworld.nl/winkels/", "Erasmus Food Plaza, Burgemeester Oudlaan 50, Rotterdam", "node/3951587367"),
  realRestaurant("coffeecompany-eur", "Coffeecompany Erasmus", "Coffee", [51.91683, 4.52584], "https://coffeecompany.nl/locations/burgermeester-oudlaan-50/", "Burgemeester Oudlaan 50, Rotterdam", "node/3951587368"),
  realRestaurant("erasmus-sport-cafe", "Erasmus Sport Café", "Café · snacks", [51.91654, 4.52851], "https://erasmussport.nl/", "Burgemeester Oudlaan 50S, Rotterdam", "node/12584877209"),
  // Kralingen
  realRestaurant("restobar-colette", "Restobar Colette", "Brasserie", [51.91704, 4.5176], "https://coletterotterdam.nl/", "Honingerdijk 263, Rotterdam", "node/13337712636"),
  realRestaurant("lokanta-proeflokaal", "Lokanta Proeflokaal", "Spanish", [51.92149, 4.51349], "https://www.lokanta-proeflokaal.nl/", "Waterloostraat 148A, Rotterdam", "node/1882432700"),
  realRestaurant("cafe-stobbe", "Café Stobbe", "Café-restaurant", [51.92492, 4.51688], "https://cafestobbe.nl/", "Kortekade 20, Rotterdam", "node/582059159"),
  realRestaurant("de-specialiteit-pniel", "De Specialiteit", "Restaurant", [51.92486, 4.51547], "https://www.despecialiteit.nl/locatie/pniel", "Oudedijk 15, Rotterdam", "node/13344560999"),
  realRestaurant("de-boshut", "De Boshut", "Restaurant", [51.92883, 4.52364], "https://deboshutrotterdam.nl/", "Kralingseweg 20, Rotterdam", "node/13019710016"),
  realRestaurant("i-love-sushi-kralingen", "I Love Sushi", "Sushi", [51.92397, 4.51038], "https://ilovesushi.nl/location/i-love-sushi-rotterdam-kralingen-nieuw/", "Lusthofstraat 70B, Rotterdam", "node/2804767370"),
  realRestaurant("van-stralen", "Van Stralen", "Restaurant", [51.92641, 4.51146], "https://www.etenbijvanstralen.nl/", "Oudedijk 110, Rotterdam", "node/1743196217"),
  realRestaurant("currys-kralingen", "Curry's", "Indian", [51.92717, 4.50968], "https://www.currys.nl/", "Oudedijk 152, Rotterdam", "node/1743186800"),
  realRestaurant("mama-licia", "Mama Licia", "Italian", [51.92762, 4.50951], "https://mammalicia.nl/", "Oudedijk 159-A, Rotterdam", "node/2804872502"),
  realRestaurant("macho-mama", "Macho Mama", "Burgers", [51.92127, 4.50626], "https://www.macho-mama.nl/", "Willem Ruyslaan 18, Rotterdam", "node/13251480502"),
  realRestaurant("toko-smoor", "Toko Smoor", "Indonesian", [51.92119, 4.50622], "https://tokosmoor.nl/", "Willem Ruyslaan 22A, Rotterdam", "node/1974891814"),
  realRestaurant("the-commons", "The Commons", "Restaurant", [51.92123, 4.50535], "https://www.thesocialhub.co/rotterdam/eat-and-drink/", "The Social Hub, Willem Ruyslaan 225, Rotterdam", "node/11711555701"),
  realRestaurant("restaurant-maas", "Maas", "Restaurant", [51.91473, 4.50773], "https://www.restaurant-maas.nl/", "Nijverheidstraat 2, Rotterdam", "node/2788109285"),
];

/** Every restaurant: map pins, Explore, restaurant pages, agent tools, recommendations, QR demos and orders. */
export const RESTAURANTS: Restaurant[] = [fitKitchen, urbanBowl, localGrill, pastaMetrica, saffronSteam, tinplateDeli, ...REAL_RESTAURANTS];

/** Restaurants with (simulated) menu data in the public product. */
export const MENU_RESTAURANTS: Restaurant[] = RESTAURANTS.filter((r) => r.meals.length > 0);

/*
 * FROZEN STUDY DATASET. Scenarios A–D, their canonical answers and
 * docs/study/scenario-difficulty.md were calibrated on exactly these three
 * brands. /baseline always uses them; the treatment uses them while a
 * research trial is running (study scope). Do not edit after freeze.
 */
export const STUDY_RESTAURANT_IDS = ["fitkitchen", "urbanbowl", "localgrill"] as const;
export const STUDY_RESTAURANTS: Restaurant[] = STUDY_RESTAURANT_IDS.map((id) => RESTAURANTS.find((r) => r.id === id)!);

let studyScope = false;
/** Set synchronously by AppState whenever a research trial starts or ends. */
export function setStudyScope(on: boolean): void {
  studyScope = on;
}
export function isStudyScope(): boolean {
  return studyScope;
}
/** Restaurants visible right now: the frozen study set during a trial, everything otherwise. */
export function catalog(): Restaurant[] {
  return studyScope ? STUDY_RESTAURANTS : RESTAURANTS;
}
/** Menu-carrying restaurants the optimizer may search right now. */
export function menuRestaurants(): Restaurant[] {
  return studyScope ? STUDY_RESTAURANTS : MENU_RESTAURANTS;
}

export const ALL_MEALS = RESTAURANTS.flatMap((r) => r.meals);

export function getRestaurant(id: string | undefined): Restaurant | undefined {
  return RESTAURANTS.find((r) => r.id === id);
}

export function getMeal(id: string | undefined) {
  const meal = ALL_MEALS.find((m) => m.id === id);
  if (!meal) return undefined;
  return { meal, restaurant: getRestaurant(meal.restaurantId)! };
}

/** Like getRestaurant, but undefined for restaurants outside the current scope (deep links during a trial). */
export function getScopedRestaurant(id: string | undefined): Restaurant | undefined {
  return catalog().find((r) => r.id === id);
}

/** Like getMeal, but undefined for dishes outside the current scope (deep links during a trial). */
export function getScopedMeal(id: string | undefined) {
  const f = getMeal(id);
  return f && catalog().includes(f.restaurant) ? f : undefined;
}

/** The Demo Day hero meal. */
export const DEMO_MEAL_ID = "fk-chicken-power-bowl";
