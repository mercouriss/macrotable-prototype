import { useEffect, useState } from "react";
import type { Selections } from "../types";
import { readJSON, writeJSON } from "./experiment";

/*
 * Saved meals: a dish + the exact supported configuration. Stored only in this
 * browser (one localStorage key), never exported, never sent anywhere, and
 * cleared from Profile. Hidden during research trials.
 */
export const SAVED_KEY = "macrotable.saved.v1";
const EVENT = "macrotable:saved";

export interface SavedMeal {
  mealId: string;
  selections: Selections;
  savedAt: number;
}

const same = (a: Selections, b: Selections) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function getSaved(): SavedMeal[] {
  const v = readJSON<SavedMeal[]>(SAVED_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function isSaved(mealId: string, selections: Selections): boolean {
  return getSaved().some((s) => s.mealId === mealId && same(s.selections, selections));
}

export function toggleSaved(mealId: string, selections: Selections): boolean {
  const list = getSaved();
  const exists = list.some((s) => s.mealId === mealId && same(s.selections, selections));
  const next = exists ? list.filter((s) => !(s.mealId === mealId && same(s.selections, selections))) : [{ mealId, selections, savedAt: Date.now() }, ...list].slice(0, 30);
  writeJSON(SAVED_KEY, next);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
  return !exists;
}

export function clearSaved(): void {
  writeJSON(SAVED_KEY, []);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Re-renders when saved meals change anywhere in the app. */
export function useSavedMeals(): SavedMeal[] {
  const [list, setList] = useState(getSaved);
  useEffect(() => {
    const on = () => setList(getSaved());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return list;
}
