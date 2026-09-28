import { PROXY_URL, ProviderError } from "../agent/gemini";
import type { ScannedItem, ScannedMenu } from "../agent/types";
import type { Nutrition } from "../types";

/*
 * Menu photo → structured, temporary menu.
 * The vision model returns JSON only; printed ("explicit") nutrition is kept
 * separate from model-inferred estimates, and every field is validated here.
 *   all four values printed         → MENU-READ
 *   printed + estimate fill-in, or estimate only → ESTIMATED
 *   neither                          → INSUFFICIENT (never recommended)
 */

export const EXTRACTION_PROMPT = `You are reading a photo of a restaurant menu for a nutrition app.
Return ONLY JSON matching the schema. Rules:
- List the dishes you can read (max 30). Use the menu's own names and descriptions.
- price: the printed price as a number, or null if not visible.
- explicitNutrition: ONLY values printed on the menu (calories, protein, carbs, fat in kcal/grams). Use null for anything not printed. Never guess here.
- estimatedNutrition: your rough estimate for a typical portion, ONLY for dishes that do not print all four values; otherwise null. These will be labelled ESTIMATED.
- markedDietary: only "vegetarian" or "vegan" when the menu explicitly marks the dish (e.g. (V), vegan icon). Otherwise [].
- visibleModifiers: add-ons/options printed for the dish (e.g. "extra chicken +€2"), as short strings.
- restaurantName: printed restaurant name or null.
- uncertainties: short notes on anything unreadable or ambiguous.
Do not invent dishes, prices or options that are not visible.`;

const NUTRITION_SCHEMA = {
  type: "object",
  nullable: true,
  properties: { calories: { type: "number", nullable: true }, protein: { type: "number", nullable: true }, carbs: { type: "number", nullable: true }, fat: { type: "number", nullable: true } },
};

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    restaurantName: { type: "string", nullable: true },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          price: { type: "number", nullable: true },
          explicitNutrition: NUTRITION_SCHEMA,
          estimatedNutrition: NUTRITION_SCHEMA,
          markedDietary: { type: "array", items: { type: "string" } },
          visibleModifiers: { type: "array", items: { type: "string" } },
        },
        required: ["name"],
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: ["items"],
};

export function buildExtractionRequest(base64Jpeg: string) {
  return {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: base64Jpeg } }, { text: EXTRACTION_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: EXTRACTION_SCHEMA },
  };
}

const KEYS: (keyof Nutrition)[] = ["calories", "protein", "carbs", "fat"];
const MAX: Record<keyof Nutrition, number> = { calories: 3000, protein: 300, carbs: 400, fat: 250 };

function cleanNutrition(v: unknown): Partial<Nutrition> {
  const out: Partial<Nutrition> = {};
  if (!v || typeof v !== "object") return out;
  for (const k of KEYS) {
    const n = (v as Record<string, unknown>)[k];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX[k]) out[k] = Math.round(n);
  }
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validate untrusted model JSON into a ScannedMenu. Throws on unusable output. */
export function parseExtraction(raw: unknown, scanId: string, source: ScannedMenu["source"], now = Date.now()): ScannedMenu {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items)) throw new ProviderError("Extraction returned no items");
  const d = data as { restaurantName?: unknown; items: unknown[]; uncertainties?: unknown };
  const items: ScannedItem[] = [];
  for (const [i, it] of d.items.slice(0, 30).entries()) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = str(o.name, 80);
    if (!name) continue;
    const printed = cleanNutrition(o.explicitNutrition);
    const estimate = cleanNutrition(o.estimatedNutrition);
    const printedFields = KEYS.filter((k) => printed[k] !== undefined);
    const merged = { ...estimate, ...printed };
    const complete = KEYS.every((k) => merged[k] !== undefined);
    const provenance: ScannedItem["provenance"] = printedFields.length === 4 ? "menu-read" : complete ? "estimated" : "insufficient";
    const price = typeof o.price === "number" && Number.isFinite(o.price) && o.price > 0 && o.price < 500 ? Math.round(o.price * 100) / 100 : null;
    const markedDietary = Array.isArray(o.markedDietary) ? o.markedDietary.filter((x): x is string => x === "vegetarian" || x === "vegan") : [];
    items.push({
      id: `i${i}`,
      name,
      description: str(o.description, 200) || undefined,
      price,
      nutrition: complete ? (merged as Nutrition) : null,
      provenance,
      printedFields,
      // vegan implies vegetarian for filtering
      markedDietary: markedDietary.includes("vegan") ? ["vegan", "vegetarian"] : markedDietary,
      visibleModifiers: Array.isArray(o.visibleModifiers) ? o.visibleModifiers.map((x) => str(x, 60)).filter(Boolean).slice(0, 6) : [],
    });
  }
  if (!items.length) throw new ProviderError("No readable dishes");
  return {
    scanId,
    restaurantName: str(d.restaurantName, 60) || null,
    items,
    uncertainties: Array.isArray(d.uncertainties) ? d.uncertainties.map((x) => str(x, 140)).filter(Boolean).slice(0, 6) : [],
    source,
    createdAt: now,
  };
}

/** Offline demo: a fixed sample extraction. It is NOT read from the user's photo and is labelled as such everywhere. */
export function simulatedExtraction(scanId: string, now = Date.now()): ScannedMenu {
  return parseExtraction(
    {
      restaurantName: "Corner Café (sample menu)",
      items: [
        { name: "Grilled Chicken Wrap", description: "Chicken, lettuce, yoghurt sauce", price: 9.5, explicitNutrition: { calories: 610, protein: 42, carbs: 55, fat: 22 } },
        { name: "Falafel Plate", description: "Falafel, hummus, salad, pita", price: 11, explicitNutrition: { calories: 720 }, estimatedNutrition: { calories: 720, protein: 24, carbs: 80, fat: 32 }, markedDietary: ["vegetarian"] },
        { name: "Tuna Salad Bowl", description: "Tuna, egg, greens, potatoes", price: 12.5, estimatedNutrition: { calories: 540, protein: 38, carbs: 30, fat: 28 } },
        { name: "Beef Burger & Fries", price: 13, explicitNutrition: { calories: 980, protein: 45, carbs: 85, fat: 50 }, visibleModifiers: ["extra cheese +€1"] },
        { name: "Soup of the Day", price: 6 },
      ],
      uncertainties: ["Sample data — not read from your photo"],
    },
    scanId,
    "simulated",
    now,
  );
}

async function blobToJpegBase64(blob: Blob, maxSide = 1600): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.8));
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Send ONE photo (after explicit consent) to the vision model via the proxy. */
export async function extractMenuFromImage(blob: Blob, scanId: string, opts: { proxyUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<ScannedMenu> {
  const url = (opts.proxyUrl ?? PROXY_URL).replace(/\/+$/, "");
  if (!url) throw new ProviderError("No proxy configured");
  const body = buildExtractionRequest(await blobToJpegBase64(blob));
  const res = await (opts.fetchImpl ?? fetch)(`${url}/v1/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new ProviderError(`Proxy HTTP ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("") ?? "";
  return parseExtraction(text, scanId, "gemini");
}
