import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAMERA_CONSTRAINTS,
  cameraSupport,
  classifyCameraError,
  detectCameraEnv,
  stopStream,
  type CameraProblem,
} from "../lib/camera";

export type CameraStatus = "idle" | "starting" | "live" | "paused" | CameraProblem;

/**
 * Owns one getUserMedia stream. `start()` must be called from a user action.
 * Tracks are stopped on stop(), on unmount, and when the page is hidden.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const release = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    if (mounted.current) setStatus("idle");
  }, [release]);

  const start = useCallback(async () => {
    const support = cameraSupport(detectCameraEnv());
    if (support !== "supported") {
      setStatus(support);
      return;
    }
    release();
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (!mounted.current) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setStatus("live");
    } catch (err) {
      if (mounted.current) setStatus(classifyCameraError(err));
    }
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.hidden && streamRef.current) {
        release();
        setStatus("paused");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [release]);

  /** Grab the current frame as a JPEG blob (in memory only). */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  }, []);

  return { videoRef, status, start, stop, capture };
}

/** Downscaled frame pixels for QR decoding. */
export function frameImageData(source: CanvasImageSource & { width?: number; height?: number }, srcW: number, srcH: number, maxSide = 720) {
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Lazy-loaded QR decoder (keeps jsQR out of the main bundle). */
export async function decodeQR(img: ImageData): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

export async function decodeQRFromFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const data = frameImageData(img, img.naturalWidth, img.naturalHeight, 1200);
    return data ? await decodeQR(data) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
