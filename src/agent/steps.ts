/*
 * Visible agent states. Each label corresponds 1:1 to real activity (a model
 * call, a tool execution, or the VERIFY check) — never invented reasoning.
 */
export const STEP_ACTIVE: Record<string, string> = {
  getUserContext: "Reading your targets",
  listNearbyStores: "Checking restaurants",
  getMenu: "Loading menu",
  optimizeMeal: "Optimizing supported configuration",
  explainProvenance: "Checking data confidence",
  analyzeMenuImage: "Reading scanned menu",
  prepareOrder: "Preparing order",
};

export const STEP_DONE: Record<string, string> = {
  getUserContext: "Read your targets",
  listNearbyStores: "Checked restaurants",
  getMenu: "Loaded menu",
  optimizeMeal: "Optimized supported configuration",
  explainProvenance: "Checked data confidence",
  analyzeMenuImage: "Read scanned menu",
  prepareOrder: "Ready for approval",
};

export const UNDERSTANDING = "Understanding request";
export const COMPOSING = "Writing reply";
export const VERIFYING = "Checking constraints";
export const VERIFIED_STEP = "Checked constraints";

/** Completed-steps checklist for a message: tool steps in order (deduped) + the VERIFY step when something was recommended. */
export function stepsFor(toolNames: string[], verified: boolean): string[] {
  const out: string[] = [];
  for (const n of toolNames) {
    const label = STEP_DONE[n];
    if (label && out[out.length - 1] !== label && !out.includes(label)) out.push(label);
  }
  if (verified) {
    const i = out.indexOf(STEP_DONE.prepareOrder);
    if (i >= 0) out.splice(i, 0, VERIFIED_STEP);
    else out.push(VERIFIED_STEP);
  }
  return out;
}
