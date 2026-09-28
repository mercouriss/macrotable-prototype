import { Screen } from "../components/Screen";
import { Card } from "../components/ui";

const SECTIONS: [string, string][] = [
  [
    "A university research prototype",
    "MacroTable is a university research prototype. Restaurant integrations, nutrition values, health synchronization, commerce actions and orders are simulated unless explicitly stated otherwise. No food is ordered and no payment is ever taken.",
  ],
  [
    "Simulated restaurants and nutrition",
    "All restaurants, dishes, prices and nutrition values are fictional demo data. VERIFIED, OFFICIAL and ESTIMATED describe where data would come from in a real product — not guaranteed accuracy. Nutrition information may vary with actual preparation.",
  ],
  [
    "Camera",
    "The camera is only switched on after you tap Scan menu or Scan QR, and it's switched off when you leave the scan screen. Your photo stays on this device in this prototype — it's never uploaded. Menu analysis is simulated: the app matches your scan to one of three demo menus and does not read text from the image.",
  ],
  [
    "Anonymous study logging",
    "Only during a study task started from a researcher's link, the app records an anonymous participant code (like P001), the task you were given, your taps in the app (e.g. meals viewed, options changed) and the meal you ordered. It never asks for your name, email, phone or student number. Data stays in this browser until the researcher exports it, and is deleted if site data is cleared.",
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
