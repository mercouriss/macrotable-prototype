import { describe, expect, it } from "vitest";
import { cameraSupport, classifyCameraError, parseRestaurantQR, stopStream } from "../src/lib/camera";

describe("camera feature detection", () => {
  it("requires a secure context before anything else", () => {
    expect(cameraSupport({ isSecureContext: false, hasGetUserMedia: false })).toBe("insecure");
    expect(cameraSupport({ isSecureContext: true, hasGetUserMedia: false })).toBe("unsupported");
    expect(cameraSupport({ isSecureContext: true, hasGetUserMedia: true })).toBe("supported");
  });

  it("classifies getUserMedia errors into user-facing states", () => {
    expect(classifyCameraError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyCameraError({ name: "SecurityError" })).toBe("denied");
    expect(classifyCameraError({ name: "NotFoundError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "OverconstrainedError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "NotReadableError" })).toBe("in-use");
    expect(classifyCameraError(new Error("boom"))).toBe("error");
    expect(classifyCameraError(null)).toBe("error");
  });

  it("stops every track when releasing the camera", () => {
    const stopped: string[] = [];
    const stream = { getTracks: () => ["video", "other"].map((k) => ({ stop: () => stopped.push(k) })) } as unknown as MediaStream;
    stopStream(stream);
    expect(stopped).toEqual(["video", "other"]);
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe("demo QR payloads", () => {
  const ids = ["fitkitchen", "urbanbowl", "localgrill"];
  it("recognises app URLs and MACROTABLE: codes for known restaurants", () => {
    expect(parseRestaurantQR("https://mercouriss.github.io/macrotable-prototype/r/fitkitchen", ids)).toEqual({ kind: "restaurant", restaurantId: "fitkitchen" });
    expect(parseRestaurantQR("http://localhost:5173/r/urbanbowl?src=table4", ids)).toEqual({ kind: "restaurant", restaurantId: "urbanbowl" });
    expect(parseRestaurantQR("MACROTABLE:LocalGrill", ids)).toEqual({ kind: "restaurant", restaurantId: "localgrill" });
  });
  it("treats anything else as an unknown code", () => {
    expect(parseRestaurantQR("https://example.com/menu.pdf", ids).kind).toBe("unknown");
    expect(parseRestaurantQR("https://x.test/r/burgerbar", ids).kind).toBe("unknown");
  });
});
