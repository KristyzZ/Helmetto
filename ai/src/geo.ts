import type { GeoPoint, Geofence, ZoneStatus } from '@helmetto/shared';

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** A position that may be missing (no GPS, no fix). */
export interface MaybePoint {
  lat: number | null | undefined;
  lon: number | null | undefined;
}

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

export const isPolygonZone = (geofence: Geofence) => geofence.shape === 'polygon';

export function isValidGeofence(geofence: Geofence | null | undefined): geofence is Geofence {
  if (!geofence) return false;
  if (isPolygonZone(geofence)) {
    const points = geofence.points;
    return Array.isArray(points) && points.length >= 3 && points.every((p) => isValidCoordinate(p?.lat, p?.lon));
  }
  return (
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

/** Distance from the centre of a circle zone, or null when it cannot be checked. */
export function distanceFromGeofenceCenter(
  geofence: Geofence | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): number | null {
  if (!isValidGeofence(geofence) || !isValidCoordinate(latitude, longitude)) return null;
  return haversineMeters(geofence.latitude, geofence.longitude, latitude!, longitude!);
}

// ---- polygons -------------------------------------------------------------------
// Safe zones are a few kilometres across at most, so polygon maths treats
// latitude/longitude as a flat plane. Zones crossing the 180° meridian or a pole
// are not supported.

/** How close (in degrees, ~0.1 mm) a point must be to an edge to count as on it. */
const EDGE_TOLERANCE_DEG = 1e-9;

function isOnSegment(lat: number, lon: number, a: GeoPoint, b: GeoPoint): boolean {
  const dLat = b.lat - a.lat;
  const dLon = b.lon - a.lon;
  const length = Math.hypot(dLat, dLon);
  if (length === 0) return Math.hypot(lat - a.lat, lon - a.lon) <= EDGE_TOLERANCE_DEG;
  const cross = dLon * (lat - a.lat) - dLat * (lon - a.lon);
  if (Math.abs(cross) > EDGE_TOLERANCE_DEG * length) return false;
  const along = ((lon - a.lon) * dLon + (lat - a.lat) * dLat) / length;
  return along >= -EDGE_TOLERANCE_DEG && along <= length + EDGE_TOLERANCE_DEG;
}

/**
 * Ray casting: count how many edges a ray from the point crosses; odd = inside.
 * A point exactly on an edge or corner counts as inside.
 */
export function isPointInPolygon(points: readonly GeoPoint[], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (isOnSegment(lat, lon, a, b)) return true;
    const straddles = a.lat > lat !== b.lat > lat;
    if (straddles && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

/** Flat x/y in meters around a reference point. */
function project(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  return {
    x: (point.lon - origin.lon) * METERS_PER_DEGREE * Math.cos(toRad(origin.lat)),
    y: (point.lat - origin.lat) * METERS_PER_DEGREE,
  };
}

export function polygonAreaM2(points: readonly GeoPoint[]): number {
  const origin = points[0];
  if (!origin || points.length < 3) return 0;
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = project(points[j]!, origin);
    const b = project(points[i]!, origin);
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

const orientation = (a: GeoPoint, b: GeoPoint, c: GeoPoint) =>
  Math.sign((b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon));

function segmentsTouch(a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && isOnSegment(c.lat, c.lon, a, b)) ||
    (o2 === 0 && isOnSegment(d.lat, d.lon, a, b)) ||
    (o3 === 0 && isOnSegment(a.lat, a.lon, c, d)) ||
    (o4 === 0 && isOnSegment(b.lat, b.lon, c, d))
  );
}

/**
 * True when the outline never crosses or touches itself: no two corners in the
 * same place and no two non-neighbouring edges meeting. A shape with no area
 * (all corners on one line) is not simple either.
 */
export function isSimplePolygon(points: readonly GeoPoint[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (points[i]!.lat === points[j]!.lat && points[i]!.lon === points[j]!.lon) return false;
    }
  }
  if (polygonAreaM2(points) === 0) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours) continue;
      if (segmentsTouch(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/** A circle that encloses the polygon: middle of its bounding box, radius to the farthest corner. */
export function enclosingCircle(points: readonly GeoPoint[]): { latitude: number; longitude: number; radius_m: number } {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const latitude = (Math.min(...lats) + Math.max(...lats)) / 2;
  const longitude = (Math.min(...lons) + Math.max(...lons)) / 2;
  const radius_m = Math.max(...points.map((p) => haversineMeters(latitude, longitude, p.lat, p.lon)));
  return { latitude, longitude, radius_m: Math.round(radius_m) };
}

function distanceToPolygonEdgeM(points: readonly GeoPoint[], lat: number, lon: number): number {
  const origin = { lat, lon };
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = project(points[j]!, origin);
    const b = project(points[i]!, origin);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

// ---- zone checks (both shapes) --------------------------------------------------

/**
 * How far inside the zone a position is, in meters: positive inside, negative
 * outside, 0 on the edge. null when it cannot be checked (no zone, or GPS
 * null/invalid).
 */
export function zoneDepthMeters(geofence: Geofence | null | undefined, point: MaybePoint | null | undefined): number | null {
  if (!isValidGeofence(geofence) || !point || !isValidCoordinate(point.lat, point.lon)) return null;
  const lat = point.lat!;
  const lon = point.lon!;
  if (isPolygonZone(geofence)) {
    const distance = distanceToPolygonEdgeM(geofence.points!, lat, lon);
    return isPointInPolygon(geofence.points!, lat, lon) ? distance : -distance;
  }
  return geofence.radius_m - haversineMeters(geofence.latitude, geofence.longitude, lat, lon);
}

/**
 * The one zone check, for circles and polygons. A position on the edge is inside.
 * 'unknown' when there is no (valid) zone or the GPS reading is null/invalid, so
 * missing GPS never counts as leaving the zone.
 */
export function isInsideZone(geofence: Geofence | null | undefined, point: MaybePoint | null | undefined): ZoneStatus {
  const depth = zoneDepthMeters(geofence, point);
  if (depth === null) return 'unknown';
  return depth >= 0 ? 'inside' : 'outside';
}

/** Same as isInsideZone, with the position as two arguments. */
export function checkGeofence(
  geofence: Geofence | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): ZoneStatus {
  return isInsideZone(geofence, { lat: latitude, lon: longitude });
}
