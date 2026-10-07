import type { Nutrition } from "../types";

/*
 * Drinks and desserts (normal/demo mode only): what someone can add to their dish at a demo restaurant.
 *
 * Kept apart from the restaurant menus (restaurants.ts) on purpose:
 *   - the optimizer and MacroAgent only ever rank `meals`, so a drink is never recommended as a meal;
 *   - the study dataset and its pinned hash stay unchanged;
 *   - research trials never show or order them.
 * Fictional demo brands only: real restaurants get no invented menu items. Values are simulated,
 * like the rest of each demo brand's menu, and calories agree with the macros (4/4/9 kcal per g).
 */

export type ExtraKind = "drink" | "dessert";

export interface MenuExtra {
  id: string;
  restaurantId: string;
  kind: ExtraKind;
  name: string;
  /** Serving, shown next to the name (e.g. "330 ml"). */
  serving: string;
  price: number;
  nutrition: Nutrition;
}

const n = (calories: number, protein: number, carbs: number, fat: number): Nutrition => ({ calories, protein, carbs, fat });
type Row = [id: string, kind: ExtraKind, name: string, serving: string, price: number, nutrition: Nutrition];

const MENU: Record<string, Row[]> = {
  fitkitchen: [
    ["fk-x-sparkling-water", "drink", "Sparkling water", "330 ml", 2.5, n(0, 0, 0, 0)],
    ["fk-x-iced-green-tea", "drink", "Iced green tea, unsweetened", "400 ml", 3, n(4, 0, 1, 0)],
    ["fk-x-protein-shake", "drink", "Vanilla protein shake", "330 ml", 4.5, n(175, 25, 12, 3)],
    ["fk-x-yogurt-berries", "dessert", "Greek yogurt with berries", "180 g", 4, n(148, 12, 16, 4)],
    ["fk-x-protein-brownie", "dessert", "Protein brownie", "60 g", 3.75, n(212, 15, 20, 8)],
  ],
  urbanbowl: [
    ["ub-x-still-water", "drink", "Still water", "500 ml", 2, n(0, 0, 0, 0)],
    ["ub-x-kombucha", "drink", "Ginger kombucha", "330 ml", 3.5, n(44, 0, 11, 0)],
    ["ub-x-orange-juice", "drink", "Fresh orange juice", "250 ml", 3.75, n(108, 2, 25, 0)],
    ["ub-x-acai-cup", "dessert", "Açaí cup with granola", "200 g", 4.5, n(220, 3, 34, 8)],
    ["ub-x-chia-pudding", "dessert", "Coconut chia pudding", "150 g", 4.25, n(236, 5, 18, 16)],
  ],
  localgrill: [
    ["lg-x-cola", "drink", "Cola", "330 ml", 2.75, n(140, 0, 35, 0)],
    ["lg-x-cola-zero", "drink", "Cola zero", "330 ml", 2.75, n(0, 0, 0, 0)],
    ["lg-x-lemonade", "drink", "House lemonade", "400 ml", 3, n(120, 0, 30, 0)],
    ["lg-x-brownie", "dessert", "Chocolate brownie", "90 g", 3.5, n(380, 5, 45, 20)],
    ["lg-x-frozen-yogurt", "dessert", "Frozen yogurt", "150 g", 3.25, n(159, 5, 28, 3)],
  ],
  pastametrica: [
    ["pm-x-sparkling-water", "drink", "Sparkling mineral water", "500 ml", 2.75, n(0, 0, 0, 0)],
    ["pm-x-espresso", "drink", "Espresso", "30 ml", 2.2, n(0, 0, 0, 0)],
    ["pm-x-lemon-soda", "drink", "Italian lemon soda", "330 ml", 3, n(128, 0, 32, 0)],
    ["pm-x-tiramisu", "dessert", "Tiramisu", "120 g", 5.5, n(444, 8, 40, 28)],
    ["pm-x-lemon-sorbet", "dessert", "Lemon sorbet", "120 g", 3.5, n(140, 0, 35, 0)],
  ],
  saffronsteam: [
    ["ss-x-mango-lassi", "drink", "Mango lassi", "300 ml", 3.95, n(216, 7, 38, 4)],
    ["ss-x-masala-chai", "drink", "Masala chai", "250 ml", 2.95, n(116, 4, 16, 4)],
    ["ss-x-sparkling-water", "drink", "Sparkling water", "330 ml", 2.25, n(0, 0, 0, 0)],
    ["ss-x-gulab-jamun", "dessert", "Gulab jamun, 2 pieces", "100 g", 3.95, n(304, 4, 45, 12)],
    ["ss-x-kheer", "dessert", "Kheer rice pudding", "150 g", 3.75, n(252, 7, 38, 8)],
  ],
  tinplate: [
    ["td-x-filter-coffee", "drink", "Filter coffee", "250 ml", 2.4, n(0, 0, 0, 0)],
    ["td-x-flat-white", "drink", "Flat white", "200 ml", 3.4, n(122, 7, 10, 6)],
    ["td-x-apple-juice", "drink", "Cloudy apple juice", "250 ml", 3, n(112, 0, 28, 0)],
    ["td-x-carrot-cake", "dessert", "Carrot cake", "110 g", 4.25, n(418, 5, 50, 22)],
    ["td-x-oat-cookie", "dessert", "Oat and raisin cookie", "50 g", 2.5, n(214, 3, 28, 10)],
  ],
  citrinemezze: [
    ["cm-x-mint-lemonade", "drink", "Mint lemonade", "400 ml", 3.5, n(108, 0, 27, 0)],
    ["cm-x-ayran", "drink", "Ayran yogurt drink", "250 ml", 2.75, n(89, 5, 6, 5)],
    ["cm-x-sparkling-water", "drink", "Sparkling water", "330 ml", 2.25, n(0, 0, 0, 0)],
    ["cm-x-baklava", "dessert", "Baklava, 2 pieces", "70 g", 3.95, n(334, 5, 38, 18)],
    ["cm-x-yogurt-honey", "dessert", "Yogurt with honey and pistachio", "150 g", 4.25, n(226, 10, 24, 10)],
  ],
  kombutide: [
    ["kt-x-matcha-latte", "drink", "Iced matcha latte", "350 ml", 4.25, n(141, 6, 18, 5)],
    ["kt-x-kombucha", "drink", "Yuzu kombucha", "330 ml", 3.75, n(44, 0, 11, 0)],
    ["kt-x-green-tea", "drink", "Hot green tea", "300 ml", 2.5, n(0, 0, 0, 0)],
    ["kt-x-mochi", "dessert", "Mochi, 2 pieces", "80 g", 3.95, n(199, 3, 40, 3)],
    ["kt-x-matcha-soft-serve", "dessert", "Matcha soft serve", "120 g", 3.75, n(212, 5, 30, 8)],
  ],
  greeneryatlas: [
    ["ga-x-green-smoothie", "drink", "Green smoothie", "350 ml", 4.5, n(162, 4, 32, 2)],
    ["ga-x-oat-flat-white", "drink", "Oat flat white", "200 ml", 3.6, n(140, 3, 14, 8)],
    ["ga-x-sparkling-water", "drink", "Sparkling water", "330 ml", 2.25, n(0, 0, 0, 0)],
    ["ga-x-chocolate-mousse", "dessert", "Vegan chocolate mousse", "120 g", 4.5, n(260, 5, 24, 16)],
    ["ga-x-fruit-salad", "dessert", "Fresh fruit salad", "200 g", 3.75, n(108, 1, 26, 0)],
  ],
  ironleafgrill: [
    ["il-x-iced-tea", "drink", "Peach iced tea", "400 ml", 2.95, n(88, 0, 22, 0)],
    ["il-x-cola-zero", "drink", "Cola zero", "330 ml", 2.75, n(0, 0, 0, 0)],
    ["il-x-sparkling-water", "drink", "Sparkling water", "330 ml", 2.25, n(0, 0, 0, 0)],
    ["il-x-cheesecake", "dessert", "New York cheesecake", "120 g", 4.75, n(398, 7, 34, 26)],
    ["il-x-grilled-pineapple", "dessert", "Grilled pineapple with lime", "150 g", 3.5, n(132, 1, 32, 0)],
  ],
};

export const EXTRAS: MenuExtra[] = Object.entries(MENU).flatMap(([restaurantId, rows]) =>
  rows.map(([id, kind, name, serving, price, nutrition]) => ({ id, restaurantId, kind, name, serving, price, nutrition })),
);
