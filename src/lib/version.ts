/*
 * Treatment identity stamped onto every participant session (V3.5 pre-pilot audit).
 * Bump TREATMENT_VERSION whenever study-relevant behaviour changes after freeze,
 * so observations from different treatments can never be pooled silently.
 */
export const TREATMENT_VERSION = "V3.5";

/** Git commit baked in at build time (vite `define`); "unknown" outside a Vite build. */
export const APP_COMMIT: string = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "unknown";
