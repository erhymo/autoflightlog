export interface GeoPosition {
  lat: number;
  lon: number;
}

/**
 * Requests the browser's current position. On the first call this is
 * what triggers the native "Allow location access?" permission prompt;
 * once granted, later calls resolve silently without re-prompting.
 * Resolves to null (never rejects) on denial, timeout, or when the
 * Geolocation API is unavailable, so callers can treat "no location"
 * as a normal, silent case rather than an error to handle.
 */
export function requestCurrentPosition(timeoutMs = 8000): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}

/** Great-circle distance between two positions, in kilometers. */
export function distanceKm(a: GeoPosition, b: GeoPosition): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Finds the nearest of a set of positioned places, within maxDistanceKm, or null if none are close enough. */
export function findNearestPlace<T extends GeoPosition>(
  position: GeoPosition,
  places: T[],
  maxDistanceKm = 15
): (T & { distanceKm: number }) | null {
  let best: (T & { distanceKm: number }) | null = null;
  for (const place of places) {
    const d = distanceKm(position, place);
    if (d <= maxDistanceKm && (!best || d < best.distanceKm)) {
      best = { ...place, distanceKm: d };
    }
  }
  return best;
}
