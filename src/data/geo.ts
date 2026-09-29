import type { GeoPoint } from "../types";

/*
 * FICTIONAL DEMO LOCATIONS. The demo brands do not exist. Pins are
 * placed near a university campus so the map feels local, and every map view
 * labels them "fictional demo store". Change DEMO_AREA to move the demo.
 */
export const DEMO_AREA = {
  label: "Rotterdam · Kralingen",
  center: { lat: 51.9185, lng: 4.5245 } as GeoPoint,
  zoom: 15,
  /** Where "you" are in the demo (no geolocation is used). */
  user: { lat: 51.9178, lng: 4.5262 } as GeoPoint,
};

export const DEMO_STORE_LOCATIONS: Record<"fitkitchen" | "urbanbowl" | "localgrill" | "pastametrica" | "saffronsteam" | "tinplate", GeoPoint> = {
  fitkitchen: { lat: 51.9203, lng: 4.5228 },
  urbanbowl: { lat: 51.9152, lng: 4.5198 },
  localgrill: { lat: 51.9214, lng: 4.5311 },
  pastametrica: { lat: 51.9192, lng: 4.5318 },
  saffronsteam: { lat: 51.9146, lng: 4.5296 },
  tinplate: { lat: 51.9232, lng: 4.5258 },
};

/** Great-circle distance in km (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceFromUser(p: GeoPoint): number {
  return distanceKm(DEMO_AREA.user, p);
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`;
}
