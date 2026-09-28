/** Absolute URL for an in-app path, respecting the deploy base (e.g. /macrotable-prototype/). */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL; // always ends with "/"
  return new URL(base + path.replace(/^\//, ""), window.location.origin).toString();
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Web Share when available, otherwise copy to clipboard. */
export async function shareLink(url: string, title: string, text?: string): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "cancelled";
      // fall through to copy
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins: hidden textarea fallback.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
