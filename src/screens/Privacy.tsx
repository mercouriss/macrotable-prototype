import { Screen } from "../components/Screen";
import { Card } from "../components/ui";

const SECTIONS: [string, string][] = [
  [
    "A university research prototype",
    "MacroTable is a university research prototype. Restaurant integrations, nutrition values, health synchronization, commerce actions and orders are simulated unless explicitly stated otherwise. No food is ordered and no payment is ever taken.",
  ],
  [
    "Real and demo restaurants",
    "Restaurants marked “Real” (Sally's Salads, Mozza and Erasmus Paviljoen) are real places whose name and location were checked on 29 September 2026. They are not affiliated with MacroTable, and the app has no menu, prices, nutrition, hours or ordering for them. Restaurants marked DEMO are fictional brands. Their integrations, menus, nutrition, prices, availability, pickup times, orders and kitchen tickets are all simulated. DEMO VERIFIED and DEMO OFFICIAL mean simulated data. MENU-READ, ESTIMATED and INSUFFICIENT describe where scanned or estimated data comes from. None of these labels guarantees accuracy.",
  ],
  [
    "MacroAgent (AI assistant)",
    "When the live assistant is available, what you type is sent through MacroTable's proxy to Google's Gemini model to understand your request. Google may keep submitted content for a limited time to detect misuse of its service, so please don't share personal information. The AI never calculates nutrition or prices; MacroTable's own code does, using only options the restaurant supports. If the live model is unavailable, an offline demo agent answers instead, and it's labelled as such.",
  ],
  [
    "Camera and menu photos",
    "The camera switches on only after you tap Scan menu or Scan QR, and switches off when you leave the scan screen. A menu photo is stored only on this device, for at most 30 minutes, and you can delete it at any time. It's sent to Gemini only if you tap \"Send photo to Gemini\". Without that, or offline, the app shows a clearly labelled sample instead of reading your photo. QR codes are decoded on the device.",
  ],
  [
    "Map",
    "The Explore map loads map images from OpenStreetMap's servers, which see your IP address like any website. Map data © OpenStreetMap contributors. DEMO pins are fictional, and your real location is never used (the map uses a fixed demo location).",
  ],
  [
    "Anonymous study logging",
    "Only during a study task started from a researcher's link, the app records an anonymous participant code (like P001), the task you were given, your taps in the app (e.g. meals viewed, options changed), how many messages you sent to MacroAgent and which tools it used (never what you wrote), and the meal you ordered. It never asks for your name, email, phone or student number. Data stays in this browser until the researcher exports it, and is deleted if site data is cleared.",
  ],
  [
    "Not a medical tool",
    "MacroTable doesn't diagnose, give medical or medication advice, manage diabetes, or infer allergens from images. It never orders anything without your explicit approval.",
  ],
];

export function Privacy() {
  return (
    <Screen title="Privacy & prototype notice" back="/macrotable/profile">
      <div className="space-y-3 pt-2 pb-8">
        {SECTIONS.map(([h, b]) => (
          <Card key={h} as="section" className="p-5">
            <h2 className="text-[16px] font-semibold tracking-tight">{h}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{b}</p>
          </Card>
        ))}
      </div>
    </Screen>
  );
}
