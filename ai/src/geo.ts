import type { Geofence, ZoneStatus } from '@helmetto/shared';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * A usable GPS reading: both values finite and in range.
 * Exactly (0, 0) is rejected too: it is what GPS modules report without a fix.
 */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

export function isValidGeofence(geofence: Geofence | null | undefined): geofence is Geofence {
  return (
    !!geofence &&
    isValidCoordinate(geofence.latitude, geofence.longitude) &&
    Number.isFinite(geofence.radius_m) &&
    geofence.radius_m > 0
  );
}

/** Great-circle distance in meters. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance from the geofence center, or null when it cannot be checked. */
export function distanceFromGeofenceCenter(
  geofence: Geofence | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): number | null {
  if (!isValidGeofence(geofence) || !isValidCoordinate(latitude, longitude)) return null;
  return haversineMeters(geofence.latitude, geofence.longitude, latitude!, longitude!);
}

/**
 * Circle geofence check. 'unknown' when there is no geofence or the GPS reading
 * is null/invalid, so missing GPS never counts as leaving the zone.
 */
export function checkGeofence(
  geofence: Geofence | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): ZoneStatus {
  const distance = distanceFromGeofenceCenter(geofence, latitude, longitude);
  if (distance === null) return 'unknown';
  return distance <= geofence!.radius_m ? 'inside' : 'outside';
}
