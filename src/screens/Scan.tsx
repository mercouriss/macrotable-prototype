import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, Callout, Card, Eyebrow } from "../components/ui";
import { decodeQR, decodeQRFromFile, frameImageData, useCamera, type CameraStatus } from "../components/useCamera";
import { catalog, getScopedRestaurant } from "../data/restaurants";
import type { Restaurant } from "../types";
import { useAgent } from "../agent/agentState";
import { PROXY_URL } from "../agent/gemini";
import { AskAgentButton } from "../components/AskAgentButton";
import { deleteScan, listScans, newScanRecord, saveScan, updateScanStatus, type ScanRecord } from "../scan/imageStore";
import { extractMenuFromImage, simulatedExtraction } from "../scan/menuExtraction";
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
  const raw = params.get("type");
  const type = raw === "menu" ? "menu" : raw === "qr" ? "qr" : null;
  const location = useLocation();
  const navigate = useNavigate();
  const [autoStart] = useState(() => (location.state as { userTap?: boolean } | null)?.userTap === true);

  // Consume the one-shot "user tapped" signal so a reload never re-opens the camera by itself.
  useEffect(() => {
    if (location.state) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  if (!type) return <ScanHub />;
  const at = getScopedRestaurant(params.get("restaurant") ?? undefined);
  return type === "menu" ? <MenuScan key="menu" autoStart={autoStart} at={at} /> : <QrScan key="qr" autoStart={autoStart} />;
}

/** Scan tab: choose menu photo or restaurant QR (the camera opens only after the tap), plus the current temporary scan. */
function ScanHub() {
  const navigate = useNavigate();
  const { log } = useAppState();
  const agent = useAgent();
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listScans().then((all) => live && setScan(all[0] ?? null));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!scan) return setThumb(null);
    const u = URL.createObjectURL(scan.imageBlob);
    setThumb(u);
    return () => URL.revokeObjectURL(u);
  }, [scan]);
  const go = (type: "menu" | "qr") => {
    log(type === "menu" ? "scan_menu_opened" : "scan_qr_opened");
    navigate(`/macrotable/scan?type=${type}`, { state: { userTap: true } });
  };
  return (
    <Screen nav>
      <h1 className="pt-6 font-display text-[27px] font-semibold tracking-[-0.02em]">Scan</h1>
      <p className="mt-1 text-[14px] text-ink-3">The camera opens only after you tap.</p>
      <div className="mt-5 grid gap-3">
        {(
          [
            ["menu", "camera", "Scan a menu", "Photograph a paper menu. MacroAgent reads it and finds what fits — lower confidence, nothing verified."],
            ["qr", "qr", "Scan a restaurant QR", "At a MacroTable restaurant: loads its verified menu and opens MacroAgent there."],
          ] as const
        ).map(([t, icon, title, body]) => (
          <button key={t} onClick={() => go(t)} className="flex items-start gap-4 rounded-[22px] border border-line-2 bg-surface p-5 text-left shadow-card hover:bg-sunken/40">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Icon name={icon} size={22} />
            </span>
            <span>
              <span className="block text-[16px] font-semibold">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{body}</span>
            </span>
          </button>
        ))}
      </div>
      {(scan || agent.state.scannedMenu) && (
        <Card className="mt-5 mb-6 p-4">
          <Eyebrow>Current menu scan</Eyebrow>
          <div className="mt-2 flex items-center gap-3">
            {thumb && <img src={thumb} alt="Your menu photo (stored on this device)" className="h-14 w-14 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1 text-[13px] text-ink-2">
              <p className="font-medium text-ink">{agent.state.scannedMenu?.restaurantName ?? "Menu photo"}</p>
              {scan && <p>Stored on this device · deleted automatically at {new Date(scan.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {agent.state.scannedMenu ? (
              <AskAgentButton context={{ kind: "scan", entry: "scan-tab" }} label="Ask Agent" />
            ) : (
              <span />
            )}
            <Button
              variant="secondary"
              icon="trash"
              onClick={async () => {
                if (scan) await deleteScan(scan.scanSessionId);
                agent.setScannedMenu(null);
                setScan(null);
                log("scan_deleted");
              }}
            >
              Delete scan
            </Button>
          </div>
        </Card>
      )}
    </Screen>
  );
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

type MenuPhase = "camera" | "captured" | "consent" | "analyzing" | "error";

function MenuScan({ autoStart, at }: { autoStart: boolean; at?: Restaurant }) {
  const cam = useCamera();
  const navigate = useNavigate();
  const { log, agentEngine } = useAppState();
  const agent = useAgent();
  const [phase, setPhase] = useState<MenuPhase>("camera");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [record, setRecord] = useState<ScanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = !!PROXY_URL && agentEngine === "auto";

  useEffect(() => {
    if (autoStart) void cam.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Photos live only as in-memory object URLs + IndexedDB (TTL); release the URL when replaced or on leave.
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const acceptPhoto = async (blob: Blob, source: "camera" | "upload") => {
    cam.stop();
    const rec = newScanRecord(blob, at?.id);
    await saveScan(rec);
    setRecord(rec);
    setPhotoUrl(URL.createObjectURL(blob));
    setPhase("captured");
    log("menu_photo_taken", { detail: { source } });
  };
  const upload = useUpload((f) => void acceptPhoto(f, "upload"));

  const shutter = async () => {
    const blob = await cam.capture();
    if (blob) await acceptPhoto(blob, "camera");
  };

  const retake = async () => {
    if (record) await deleteScan(record.scanSessionId);
    setRecord(null);
    setPhotoUrl(null);
    setPhase("camera");
    void cam.start();
  };

  const analyze = async (useLive: boolean) => {
    if (!record) return;
    setPhase("analyzing");
    setError(null);
    await updateScanStatus(record.scanSessionId, "analyzing");
    try {
      let menu = useLive ? await extractMenuFromImage(record.imageBlob, record.scanSessionId, agentEngine) : simulatedExtraction(record.scanSessionId);
      // A real photo of this restaurant's menu may carry its name; the offline SAMPLE never does.
      if (at && menu.source === "gemini" && !menu.restaurantName) menu = { ...menu, restaurantName: at.name };
      if (at && menu.source === "simulated") menu = { ...menu, uncertainties: [`Sample data — not ${at.name}'s menu and not read from your photo`] };
      if (useLive) log("scan_image_sent_to_model", { detail: { items: menu.items.length } });
      await updateScanStatus(record.scanSessionId, "extracted");
      agent.setScannedMenu(menu);
      navigate("/macrotable/agent", { replace: true, state: { agentContext: { kind: "scan", entry: "menu-scan" } } });
    } catch (e) {
      await updateScanStatus(record.scanSessionId, "failed");
      setError((e as Error).message);
      setPhase("error");
      log("scan_extraction_failed");
    }
  };

  return (
    <Screen
      title={at ? `Scan menu · ${at.name}` : "Scan menu"}
      back="/macrotable/scan"
      footer={
        phase === "captured" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" icon="refresh" onClick={retake}>
              Retake
            </Button>
            <Button onClick={() => (live ? setPhase("consent") : void analyze(false))}>Analyze menu</Button>
          </div>
        ) : phase === "consent" ? (
          <div className="space-y-2">
            <Button onClick={() => void analyze(true)}>Send photo to Gemini</Button>
            <Button variant="ghost" onClick={() => void analyze(false)}>
              Use offline sample instead
            </Button>
          </div>
        ) : phase === "error" ? (
          <div className="space-y-2">
            <Button onClick={() => void analyze(false)}>Continue with offline sample</Button>
            <Button variant="ghost" onClick={retake}>
              Retake photo
            </Button>
          </div>
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
            <img src={photoUrl} alt="Your menu photo" className={`max-h-[42dvh] w-full object-contain ${phase === "analyzing" ? "opacity-60" : ""}`} />
            {phase === "analyzing" && (
              <div className="absolute inset-x-6 top-6 h-0.5 animate-scan rounded-full bg-brand shadow-[0_0_12px_2px_rgb(30_107_82/0.5)]" />
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Icon name="lock" size={14} /> Stored only on this device, deleted automatically after 30 minutes.
          </p>

          {phase === "captured" && !live && (
            <div className="mt-4">
              <Callout tone="info" title="Offline demo mode">
                No live vision model is connected, so "Analyze" shows a <strong>sample</strong> extraction — it is not read from your photo.
              </Callout>
            </div>
          )}
          {phase === "consent" && (
            <div className="mt-4">
              <Callout tone="estimated" title="Send this photo to Google Gemini?" icon="info">
                To read the menu, the photo is sent once via MacroTable's proxy to Google's Gemini model. MacroTable doesn't store it; Google may
                keep it for a limited time to detect misuse of its service. Avoid photos with people or personal details.
              </Callout>
            </div>
          )}
          {phase === "analyzing" && (
            <p className="mt-5 text-[15px] font-medium" aria-live="polite">
              Reading the menu…
            </p>
          )}
          {phase === "error" && (
            <div className="mt-4">
              <Callout tone="warn" title="Couldn't read the menu">
                The live model didn't return a usable menu ({error}). You can continue with the offline sample or retake the photo.
              </Callout>
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
    const parsed = parseRestaurantQR(text, catalog().map((r) => r.id));
    log("qr_scanned", { detail: { source, known: parsed.kind === "restaurant" } });
    if (parsed.kind === "restaurant")
      navigate("/macrotable/agent", { replace: true, state: { agentContext: { kind: "restaurant", id: parsed.restaurantId, entry: "qr" } } });
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
          <h2 className="mt-4 font-display text-[24px] font-semibold tracking-tight">MacroTable doesn't have verified menu data here.</h2>
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
