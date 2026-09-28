import type { ModifierOption, Nutrition, Restaurant } from "../types";

/*
 * ALL DATA IN THIS FILE IS FICTIONAL MOCK DATA for a university prototype.
 * Restaurants, recipes, prices and nutrition values are invented. Deltas are
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

// ─── Level 3 · Verified MacroTable partner ─────────────────────────────────
const fitKitchen: Restaurant = {
  id: "fitkitchen",
  name: "FitKitchen",
  integrationLevel: 3,
  cuisine: "Protein bowls",
  tagline: "Verified recipes · chef-approved modifications",
  estimatedDeliveryMinutes: 25,
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
  name: "Urban Bowl",
  integrationLevel: 2,
  cuisine: "Build-your-own bowls",
  tagline: "Official nutrition · structured menu",
  estimatedDeliveryMinutes: 30,
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
  name: "Local Grill",
  integrationLevel: 1,
  cuisine: "Grill & wraps",
  tagline: "Public menu only · estimated nutrition",
  estimatedDeliveryMinutes: 20,
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
      provenance: "estimated",
      available: true,
      dietaryTags: [],
      palette: ["#D8CFC0", "#B7AA95", "#EDE7DC", "#A39883"],
      modifierGroups: [],
    },
  ],
};

export const RESTAURANTS: Restaurant[] = [fitKitchen, urbanBowl, localGrill];

export const ALL_MEALS = RESTAURANTS.flatMap((r) => r.meals);

export function getRestaurant(id: string | undefined): Restaurant | undefined {
  return RESTAURANTS.find((r) => r.id === id);
}

export function getMeal(id: string | undefined) {
  const meal = ALL_MEALS.find((m) => m.id === id);
  if (!meal) return undefined;
  return { meal, restaurant: getRestaurant(meal.restaurantId)! };
}

/** The Demo Day hero meal. */
export const DEMO_MEAL_ID = "fk-chicken-power-bowl";
