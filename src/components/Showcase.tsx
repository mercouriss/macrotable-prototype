import { resolveShowcase, SHOWCASE_VIDEO_URL } from "./showcaseSource";
import { Icon } from "./Icon";

/** Desktop-only product demo (never mounted on mobile, so nothing is fetched there). */
export function ShowcaseVideo() {
  const src = resolveShowcase(SHOWCASE_VIDEO_URL, import.meta.env.BASE_URL);
  return (
    <figure className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-card">
      <div className="relative aspect-video w-full bg-ink">
        {src.kind === "iframe" && (
          <iframe
            src={src.src}
            title="MacroTable product demo video"
            loading="lazy"
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
        {src.kind === "video" && (
          <video src={src.src} controls preload="metadata" playsInline className="absolute inset-0 h-full w-full bg-ink object-contain" aria-label="MacroTable product demo video">
            Your browser can't play this video.
          </video>
        )}
        {src.kind === "none" && (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_25%,#26453a,#16181c_70%)] px-8 text-center text-white">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/25 bg-white/10" aria-hidden="true">
                <Icon name="arrowRight" size={22} />
              </span>
              <p className="mt-4 font-display text-[22px] font-semibold tracking-tight">MacroTable Product Demo</p>
              <p className="mt-1 text-[14px] text-white/70">Demo video coming soon.</p>
            </div>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-5 py-3 text-[12.5px] text-ink-3">
        <span>Product demo</span>
        <span>The interactive app is on the left</span>
      </figcaption>
    </figure>
  );
}
