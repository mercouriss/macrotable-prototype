/*
 * Restaurant-QR entry (e.g. the Demo Day presentation QR → /r/fitkitchen).
 *
 * A visitor who arrives by scanning a restaurant's QR has already been taken to the restaurant, so after
 * ordering, "Back to home" should show their updated "Remaining today" rather than the first-run
 * onboarding. This marker is set by the QR landing (outside research trials) and lives in sessionStorage:
 * this browser tab only, gone when the tab closes. It does NOT mark onboarding as done, so an ordinary
 * first visit to the app still gets onboarding, and it grants nothing else.
 */

const KEY = "macrotable.qrEntry.v1";

export function markQrEntry(restaurantId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ restaurantId, at: Date.now() }));
  } catch {
    /* storage unavailable: the visitor just sees onboarding, as before */
  }
}

/** True if this tab was opened through a restaurant QR landing. */
export function cameFromQr(): boolean {
  try {
    return !!sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}
