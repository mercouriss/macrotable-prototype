/*
 * Desktop showcase video. Configure at build time with VITE_SHOWCASE_VIDEO_URL
 * (GitHub Actions repo variable SHOWCASE_VIDEO_URL):
 *   - YouTube / Vimeo page or embed URL → privacy-friendly embed iframe
 *   - direct .mp4/.webm/.mov/.m4v (absolute https, or a path inside public/) → HTML5 <video>
 *   - any other https URL → iframe as given (e.g. Loom or Drive embed)
 * Unset or unrecognised → polished placeholder.
 */
export const SHOWCASE_VIDEO_URL: string = (import.meta.env.VITE_SHOWCASE_VIDEO_URL ?? "").trim();

export type ShowcaseSource = { kind: "none" } | { kind: "video"; src: string } | { kind: "iframe"; src: string };

export function resolveShowcase(raw: string, base = "/"): ShowcaseSource {
  const url = raw.trim();
  if (!url) return { kind: "none" };
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) {
    if (/^https:\/\//i.test(url)) return { kind: "video", src: url };
    if (!/^[a-z]+:/i.test(url)) return { kind: "video", src: base + url.replace(/^\//, "") };
    return { kind: "none" };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "none" };
  }
  if (u.protocol !== "https:") return { kind: "none" };
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const yt =
    host === "youtu.be"
      ? u.pathname.slice(1)
      : host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")
        ? (u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([\w-]{6,})/.exec(u.pathname)?.[1] ?? "")
        : "";
  if (yt && /^[\w-]{6,}$/.test(yt)) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0` };
  const vimeo = host.endsWith("vimeo.com") ? /(\d{6,})/.exec(u.pathname)?.[1] : undefined;
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo}?dnt=1` };
  return { kind: "iframe", src: u.toString() };
}
