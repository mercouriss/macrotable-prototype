import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LEVEL_META } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { Button, Callout, Card, Eyebrow } from "../components/ui";
import { decodeQR, decodeQRFromFile, frameImageData, useCamera, type CameraStatus } from "../components/useCamera";
import { RESTAURANTS } from "../data/restaurants";
import { CAMERA_PROBLEM_TEXT, parseRestaurantQR, type CameraProblem } from "../lib/camera";
import { useAppState } from "../state/AppState";

const PHOTO_NOTE = "Your photo stays on this device in this prototype.";
const PROBLEMS: CameraStatus[] = ["denied", "unavailable", "in-use", "insecure", "unsupported", "error"];
const isProblem = (s: CameraStatus): s is CameraProblem => PROBLEMS.includes(s);

/**
 * Real camera capture (rear camera preferred) with an upload fallback.
 * The camera only starts after the user taps Scan menu / Scan QR / Open camera.
 */
export function Scan() {
  const [params] = useSearchParams();
  const type = params.get("type") === "menu" ? "menu" : "qr";
  const location = useLocation();
  const navigate = useNavigate();
  const [autoStart] = useState(() => (location.state as { userTap?: boolean } | null)?.userTap === true);

  // Consume the one-shot "user tapped" signal so a reload never re-opens the camera by itself.
  useEffect(() => {
    if (location.state) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  return type === "menu" ? <MenuScan key="menu" autoStart={autoStart} /> : <QrScan key="qr" autoStart={autoStart} />;
}

// ─── Shared camera UI ─────────────────────────────────────────────────────

function useUpload(onFile: (f: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

function Viewfinder({
  cam,
  children,
  placeholder,
}: {
  cam: ReturnType<typeof useCamera>;
  children?: ReactNode;
  placeholder: ReactNode;
}) {
  const showVideo = cam.status === "starting" || cam.status === "live";
  return (
    <div className="relative aspect-[3/4] max-h-[52dvh] w-full overflow-hidden rounded-[28px] bg-ink">
      <video
        ref={cam.videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Camera preview"
        className={`absolute inset-0 h-full w-full object-cover ${showVideo ? "" : "hidden"}`}
      />
      {!showVideo && <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/70">{placeholder}</div>}
      {cam.status === "starting" && (
        <div className="absolute inset-0 grid place-items-center text-[14px] text-white/80">Starting camera…</div>
      )}
      {cam.status === "live" && children}
      {["top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl-xl", "top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr-xl", "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl-xl", "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br-xl"].map((c) => (
        <span key={c} className={`pointer-events-none absolute h-8 w-8 border-white/85 ${c}`} aria-hidden="true" />
      ))}
    </div>
  );
}

function CameraProblemCallout({ status }: { status: CameraProblem }) {
  const t = CAMERA_PROBLEM_TEXT[status];
  return (
    <Callout tone="warn" title={t.title} icon="camera">
      {t.body}
    </Callout>
  );
}

function StartControls({
  cam,
  onUpload,
  startLabel = "Open camera",
}: {
  cam: ReturnType<typeof useCamera>;
  onUpload: () => void;
  startLabel?: string;
}) {
  const problem = isProblem(cam.status) ? cam.status : null;
  const canRetry = problem !== "insecure" && problem !== "unsupported";
  return (
    <div className="space-y-2.5">
      {problem && <CameraProblemCallout status={problem} />}
      {cam.status === "paused" && (
        <Callout tone="info" title="Camera paused">
          The camera stops when you leave the app. Tap to turn it back on.
        </Callout>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {canRetry ? (
          <Button icon="camera" onClick={cam.start} disabled={cam.status === "starting"}>
            {problem || cam.status === "paused" ? "Try again" : startLabel}
          </Button>
        ) : null}
        <Button variant="secondary" icon="download" onClick={onUpload} className={canRetry ? "" : "col-span-2"}>
          Upload photo
        </Button>
      </div>
    </div>
  );
}

// ─── Menu scan ────────────────────────────────────────────────────────────

type MenuPhase = "camera" | "captured" | "analyzing" | "result";

function MenuScan({ autoStart }: { autoStart: boolean }) {
  const cam = useCamera();
  const navigate = useNavigate();
  const { log } = useAppState();
  const [phase, setPhase] = useState<MenuPhase>("camera");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [match, setMatch] = useState("localgrill");

  useEffect(() => {
    if (autoStart) void cam.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Photos live only in memory as object URLs; release them when replaced or on leave.
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const acceptPhoto = (blob: Blob, source: "camera" | "upload") => {
    cam.stop();
    setPhotoUrl(URL.createObjectURL(blob));
    setPhase("captured");
    log("menu_photo_taken", { detail: { source } });
  };
  const upload = useUpload((f) => acceptPhoto(f, "upload"));

  const shutter = async () => {
    const blob = await cam.capture();
    if (blob) acceptPhoto(blob, "camera");
  };

  const analyze = () => {
    setPhase("analyzing");
    setTimeout(() => setPhase("result"), 1400);
  };

  const retake = () => {
    setPhotoUrl(null);
    setPhase("camera");
    void cam.start();
  };

  const restaurant = RESTAURANTS.find((r) => r.id === match)!;

  return (
    <Screen
      title="Scan menu"
      back="/macrotable"
      footer={
        phase === "captured" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" icon="refresh" onClick={retake}>
              Retake
            </Button>
            <Button onClick={analyze}>Analyze menu</Button>
          </div>
        ) : phase === "result" ? (
          <Button
            onClick={() => {
              log("menu_matched", { detail: { restaurantId: match } });
              navigate(`/macrotable/preferences?scope=${match}`);
            }}
          >
            Find what fits my macros
          </Button>
        ) : undefined
      }
    >
      {upload.input}
      {phase === "camera" && (
        <div className="space-y-4 pt-1 pb-6">
          <Viewfinder
            cam={cam}
            placeholder={
              <div>
                <Icon name="camera" size={34} className="mx-auto" />
                <p className="mt-3 text-[14px]">Photograph a paper menu</p>
              </div>
            }
          >
            <div className="absolute inset-x-0 bottom-5 flex justify-center">
              <button
                onClick={shutter}
                aria-label="Take photo"
                className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white/90 bg-white/20 backdrop-blur active:scale-95"
              >
                <span className="h-[54px] w-[54px] rounded-full bg-white" />
              </button>
            </div>
          </Viewfinder>
          {cam.status === "live" ? (
            <div className="flex items-center justify-between">
              <Button variant="ghost" full={false} onClick={cam.stop}>
                Cancel
              </Button>
              <Button variant="ghost" full={false} icon="download" onClick={upload.open}>
                Upload instead
              </Button>
            </div>
          ) : (
            <StartControls cam={cam} onUpload={upload.open} />
          )}
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Icon name="lock" size={14} /> {PHOTO_NOTE}
          </p>
        </div>
      )}

      {phase !== "camera" && photoUrl && (
        <div className="pt-1 pb-6">
          <div className="relative overflow-hidden rounded-[24px] bg-sunken">
            <img src={photoUrl} alt="Your menu photo" className={`max-h-[46dvh] w-full object-contain ${phase === "analyzing" ? "opacity-60" : ""}`} />
            {phase === "analyzing" && (
              <div className="absolute inset-x-6 top-6 h-0.5 animate-scan rounded-full bg-brand shadow-[0_0_12px_2px_rgb(30_107_82/0.5)]" />
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Icon name="lock" size={14} /> {PHOTO_NOTE}
          </p>

          {phase === "analyzing" && (
            <p className="mt-5 text-[15px] font-medium" aria-live="polite">
              Prototype analysis — matching this image to our demo menu dataset…
            </p>
          )}

          {phase === "result" && (
            <div className="mt-5 animate-rise" aria-live="polite">
              <Card className="p-5">
                <Eyebrow>Matched to demo menu</Eyebrow>
                <p className="mt-1 font-display text-[24px] font-semibold tracking-tight">{restaurant.name}</p>
                <p className="text-[13.5px] text-ink-2">
                  {restaurant.cuisine} · {LEVEL_META[restaurant.integrationLevel].short}
                </p>
                <p className="mt-3 text-[13px] leading-snug text-ink-3">
                  Simulated match: this prototype doesn't read text from your photo. It connects the scan to one of the three demo menus.
                </p>
              </Card>
              <fieldset className="mt-4">
                <legend className="mb-2 text-[13px] font-medium text-ink-2">Wrong menu? Choose the demo menu</legend>
                <div className="grid gap-2">
                  {RESTAURANTS.map((r) => (
                    <label
                      key={r.id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 ${match === r.id ? "border-ink bg-surface" : "border-line bg-surface"}`}
                    >
                      <input type="radio" name="menu-match" value={r.id} checked={match === r.id} onChange={() => setMatch(r.id)} className="h-4 w-4 accent-[var(--color-ink)]" />
                      <span className="flex-1 text-[14.5px] font-medium">{r.name}</span>
                      <span className="text-[12px] text-ink-3">{LEVEL_META[r.integrationLevel].short}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      )}
    </Screen>
  );
}

// ─── QR scan ──────────────────────────────────────────────────────────────

function QrScan({ autoStart }: { autoStart: boolean }) {
  const cam = useCamera();
  const navigate = useNavigate();
  const { log } = useAppState();
  const [unknown, setUnknown] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (autoStart) void cam.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = (text: string, source: "camera" | "upload" | "demo") => {
    cam.stop();
    const parsed = parseRestaurantQR(text, RESTAURANTS.map((r) => r.id));
    log("qr_scanned", { detail: { source, known: parsed.kind === "restaurant" } });
    if (parsed.kind === "restaurant") navigate(`/r/${parsed.restaurantId}`, { replace: true });
    else setUnknown(parsed.text);
  };

  // Decode a downscaled frame every 300 ms while the camera is live.
  useEffect(() => {
    if (cam.status !== "live") return;
    const t = setInterval(async () => {
      const v = cam.videoRef.current;
      if (busy.current || !v || !v.videoWidth) return;
      busy.current = true;
      try {
        const img = frameImageData(v, v.videoWidth, v.videoHeight);
        const text = img ? await decodeQR(img) : null;
        if (text) handle(text, "camera");
      } finally {
        busy.current = false;
      }
    }, 300);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.status]);

  const upload = useUpload(async (f) => {
    setUploadError(null);
    cam.stop();
    const text = await decodeQRFromFile(f);
    if (text) handle(text, "upload");
    else setUploadError("No QR code found in that photo. Try a sharper, closer photo of the code.");
  });

  if (unknown !== null) {
    return (
      <Screen
        title="Scan restaurant QR"
        back="/macrotable"
        footer={
          <div className="space-y-2">
            <Button icon="camera" onClick={() => navigate("/macrotable/scan?type=menu", { replace: true, state: { userTap: true } })}>
              Scan the menu instead
            </Button>
            <Button variant="secondary" onClick={() => navigate("/macrotable/discover")}>
              Browse restaurants
            </Button>
          </div>
        }
      >
        <div className="pt-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-estimated-soft text-estimated" aria-hidden="true">
            <Icon name="qr" size={24} />
          </span>
          <h2 className="mt-4 font-display text-[24px] font-semibold tracking-tight">No MacroTable data for this code</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
            This QR code isn't linked to a restaurant with structured menu data, so MacroTable can't read dishes or supported
            modifications from it.
          </p>
          <p className="mt-3 truncate rounded-xl bg-sunken px-3 py-2 font-mono text-[12px] text-ink-3" title={unknown}>
            {unknown || "(empty code)"}
          </p>
          <div className="mt-4">
            <Callout tone="estimated" title="Try estimated mode" icon="info">
              Photograph the menu instead. MacroTable can then only estimate nutrition and hand you off — it can't modify dishes.
            </Callout>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Scan restaurant QR" back="/macrotable">
      {upload.input}
      <div className="space-y-4 pt-1 pb-6">
        <Viewfinder
          cam={cam}
          placeholder={
            <div>
              <Icon name="qr" size={34} className="mx-auto" />
              <p className="mt-3 text-[14px]">Point the camera at a table QR code</p>
            </div>
          }
        >
          <div className="absolute inset-x-8 top-8 h-0.5 animate-scan rounded-full bg-[#7fd1ae] shadow-[0_0_12px_2px_rgb(127_209_174/0.7)]" />
          <p className="absolute inset-x-0 bottom-5 text-center text-[13px] font-medium text-white" aria-live="polite">
            Looking for a QR code…
          </p>
        </Viewfinder>

        {cam.status === "live" ? (
          <div className="flex items-center justify-between">
            <Button variant="ghost" full={false} onClick={cam.stop}>
              Cancel
            </Button>
            <Button variant="ghost" full={false} icon="download" onClick={upload.open}>
              Upload instead
            </Button>
          </div>
        ) : (
          <StartControls cam={cam} onUpload={upload.open} />
        )}
        {uploadError && (
          <p role="alert" className="text-[13px] font-medium text-warn">
            {uploadError}
          </p>
        )}
        <button
          onClick={() => handle("MACROTABLE:fitkitchen", "demo")}
          className="min-h-11 w-full rounded-2xl border border-dashed border-line px-4 text-[13.5px] font-medium text-ink-2 hover:bg-sunken"
        >
          Demo: simulate FitKitchen's table QR
        </button>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Icon name="lock" size={14} /> Scanning happens on this device. Images are never uploaded.
        </p>
      </div>
    </Screen>
  );
}
