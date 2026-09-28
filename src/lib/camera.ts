/*
 * Camera feature detection and error classification — pure so it can be tested.
 * The camera is only ever started from an explicit user tap, and every
 * camera screen also offers "Upload photo".
 */

export type CameraSupport = "supported" | "insecure" | "unsupported";

export interface CameraEnv {
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
}

export function detectCameraEnv(): CameraEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { isSecureContext: false, hasGetUserMedia: false };
  return {
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
  };
}

export function cameraSupport(env: CameraEnv): CameraSupport {
  // Browsers hide mediaDevices entirely on plain-HTTP origins, so check that first.
  if (!env.isSecureContext) return "insecure";
  if (!env.hasGetUserMedia) return "unsupported";
  return "supported";
}

export type CameraProblem = "denied" | "unavailable" | "in-use" | "insecure" | "unsupported" | "error";

export function classifyCameraError(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "unavailable";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    default:
      return "error";
  }
}

export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, { title: string; body: string }> = {
  denied: {
    title: "Camera permission denied",
    body: "You can allow camera access in your browser's site settings and try again — or upload a photo instead.",
  },
  unavailable: {
    title: "No camera available",
    body: "This device doesn't seem to have a usable camera. Upload a photo instead.",
  },
  "in-use": {
    title: "Camera is busy",
    body: "Another app may be using the camera. Close it and try again, or upload a photo instead.",
  },
  insecure: {
    title: "Camera needs a secure connection",
    body: "Browsers only allow the camera on HTTPS pages. Open the public https:// link, or upload a photo instead.",
  },
  unsupported: {
    title: "Camera not supported in this browser",
    body: "Upload a photo instead.",
  },
  error: {
    title: "Couldn't start the camera",
    body: "Try again, or upload a photo instead.",
  },
};

/** Rear camera preferred; never audio. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

// ─── Demo QR payloads ─────────────────────────────────────────────────────

/**
 * Demo QR codes encode the app URL `<origin><base>r/<restaurantId>` so a phone's
 * native camera opens the app directly; the in-app scanner also accepts
 * `MACROTABLE:<restaurantId>`.
 */
export function parseRestaurantQR(text: string, knownIds: string[]): { kind: "restaurant"; restaurantId: string } | { kind: "unknown"; text: string } {
  const t = text.trim();
  const direct = /^MACROTABLE:([a-z0-9-]+)$/i.exec(t);
  const url = /\/r\/([a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(t);
  const id = (direct?.[1] ?? url?.[1])?.toLowerCase();
  if (id && knownIds.includes(id)) return { kind: "restaurant", restaurantId: id };
  return { kind: "unknown", text: t };
}
