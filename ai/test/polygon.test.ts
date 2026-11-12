import { describe, expect, it } from 'vitest';
import type { GeoPoint, Geofence, Telemetry } from '@helmetto/shared';
import {
  NO_CONDITIONS,
  checkGeofence,
  enclosingCircle,
  evaluateTelemetry,
  isInsideZone,
  isPointInPolygon,
  isSimplePolygon,
  isValidGeofence,
  polygonAreaM2,
  zoneDepthMeters,
  type Conditions,
} from '../src';

const LAT = 54.6872;
const LON = 25.2797;
const M_PER_DEG = 111_195;
/** A point `north` / `east` meters from the reference corner. */
const at = (north: number, east: number): GeoPoint => ({
  lat: LAT + north / M_PER_DEG,
  lon: LON + east / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180)),
});

const polygon = (points: GeoPoint[]): Geofence => ({
  shape: 'polygon',
  points,
  ...enclosingCircle(points),
});

/** 200 m x 200 m square with its south-west corner at the reference point. */
const square = polygon([at(0, 0), at(0, 200), at(200, 200), at(200, 0)]);

/** An "L": a 300 x 300 square with the north-east 200 x 200 quarter cut out. */
const lShape = polygon([at(0, 0), at(0, 300), at(100, 300), at(100, 100), at(300, 100), at(300, 0)]);

/** A "U" opening to the north: the gap is between east 100 and 200. */
const uShape = polygon([
  at(0, 0), at(0, 300), at(300, 300), at(300, 200), at(100, 200), at(100, 100), at(300, 100), at(300, 0),
]);

describe('isPointInPolygon (ray casting)', () => {
  it('inside', () => {
    const p = at(100, 100);
    expect(isPointInPolygon(square.points!, p.lat, p.lon)).toBe(true);
  });
  it('outside on every side', () => {
    for (const p of [at(-10, 100), at(210, 100), at(100, -10), at(100, 210), at(-5, -5)]) {
      expect(isPointInPolygon(square.points!, p.lat, p.lon)).toBe(false);
    }
  });
  it('a point on an edge or on a corner counts as inside', () => {
    const corner = square.points![0]!;
    expect(isPointInPolygon(square.points!, corner.lat, corner.lon)).toBe(true);
    // middle of the west edge and of the south edge (exactly representable midpoints)
    const [sw, se, , nw] = square.points! as [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
    expect(isPointInPolygon(square.points!, (sw.lat + nw.lat) / 2, sw.lon)).toBe(true);
    expect(isPointInPolygon(square.points!, sw.lat, (sw.lon + se.lon) / 2)).toBe(true);
  });
  it('just past an edge is outside', () => {
    const p = at(100, 200.5);
    expect(isPointInPolygon(square.points!, p.lat, p.lon)).toBe(false);
  });
  it('gives the same answer whichever way the corners were drawn', () => {
    const reversed = [...square.points!].reverse();
    const inside = at(50, 150);
    const outside = at(250, 150);
    expect(isPointInPolygon(reversed, inside.lat, inside.lon)).toBe(true);
    expect(isPointInPolygon(reversed, outside.lat, outside.lon)).toBe(false);
  });
  it('handles a ray passing exactly through a corner', () => {
    const diamond = [at(0, 100), at(100, 200), at(200, 100), at(100, 0)];
    const level = diamond[1]!.lat; // same latitude as the east and west corners
    expect(isPointInPolygon(diamond, level, at(100, 100).lon)).toBe(true);
    expect(isPointInPolygon(diamond, level, at(100, -50).lon)).toBe(false);
    expect(isPointInPolygon(diamond, level, at(100, 250).lon)).toBe(false);
  });
});

describe('concave shapes', () => {
  it('L shape: the cut-out corner is outside', () => {
    expect(isInsideZone(lShape, at(50, 50))).toBe('inside');
    expect(isInsideZone(lShape, at(50, 250))).toBe('inside');
    expect(isInsideZone(lShape, at(250, 50))).toBe('inside');
    expect(isInsideZone(lShape, at(200, 200))).toBe('outside'); // inside the bounding box, outside the zone
  });
  it('U shape: the gap between the arms is outside', () => {
    expect(isInsideZone(uShape, at(200, 50))).toBe('inside');
    expect(isInsideZone(uShape, at(200, 250))).toBe('inside');
    expect(isInsideZone(uShape, at(50, 150))).toBe('inside');
    expect(isInsideZone(uShape, at(200, 150))).toBe('outside');
  });
});

describe('isInsideZone', () => {
  const circle: Geofence = { latitude: LAT, longitude: LON, radius_m: 300 };

  it('handles circles, with or without shape: "circle"', () => {
    expect(isInsideZone(circle, at(100, 100))).toBe('inside');
    expect(isInsideZone(circle, at(400, 0))).toBe('outside');
    expect(isInsideZone({ ...circle, shape: 'circle' }, at(100, 100))).toBe('inside');
    expect(isInsideZone({ ...circle, shape: 'circle' }, at(400, 0))).toBe('outside');
  });
  it('handles polygons, ignoring the enclosing-circle fields', () => {
    const corner = at(-20, -20); // inside the enclosing circle, outside the square
    expect(isInsideZone(square, at(100, 100))).toBe('inside');
    expect(isInsideZone(square, corner)).toBe('outside');
  });
  it('on the edge is inside for both shapes', () => {
    expect(isInsideZone(square, square.points![2]!)).toBe('inside');
    expect(isInsideZone(circle, { lat: LAT, lon: LON })).toBe('inside');
  });
  it('unknown when GPS is null or invalid', () => {
    for (const zone of [square, circle]) {
      expect(isInsideZone(zone, null)).toBe('unknown');
      expect(isInsideZone(zone, { lat: null, lon: null })).toBe('unknown');
      expect(isInsideZone(zone, { lat: LAT, lon: null })).toBe('unknown');
      expect(isInsideZone(zone, { lat: 0, lon: 0 })).toBe('unknown');
      expect(isInsideZone(zone, { lat: 123, lon: 25 })).toBe('unknown');
      expect(isInsideZone(zone, { lat: NaN, lon: 25 })).toBe('unknown');
    }
  });
  it('unknown without a zone or with a broken polygon', () => {
    expect(isInsideZone(null, at(1, 1))).toBe('unknown');
    expect(isInsideZone({ ...square, points: square.points!.slice(0, 2) }, at(1, 1))).toBe('unknown');
    expect(isInsideZone({ ...square, points: undefined }, at(1, 1))).toBe('unknown');
    expect(isValidGeofence({ ...square, points: [at(0, 0), at(0, 1), { lat: 999, lon: 0 }] })).toBe(false);
  });
  it('checkGeofence is the same check', () => {
    const p = at(100, 100);
    expect(checkGeofence(square, p.lat, p.lon)).toBe('inside');
    expect(checkGeofence(square, null, null)).toBe('unknown');
  });
});

describe('polygon helpers', () => {
  it('area of the 200 m square', () => {
    expect(polygonAreaM2(square.points!)).toBeCloseTo(40_000, -2);
  });
  it('depth: positive inside, negative outside, in meters', () => {
    expect(zoneDepthMeters(square, at(100, 100))).toBeCloseTo(100, 0);
    expect(zoneDepthMeters(square, at(100, 190))).toBeCloseTo(10, 0);
    expect(zoneDepthMeters(square, at(100, 230))).toBeCloseTo(-30, 0);
    expect(zoneDepthMeters(square, { lat: null, lon: null })).toBeNull();
  });
  it('enclosing circle covers every corner', () => {
    const circle = enclosingCircle(lShape.points!);
    for (const p of lShape.points!) {
      expect(isInsideZone({ ...circle, radius_m: circle.radius_m + 1 }, p)).toBe('inside');
    }
  });
  it('detects self-intersecting outlines', () => {
    expect(isSimplePolygon(square.points!)).toBe(true);
    expect(isSimplePolygon(lShape.points!)).toBe(true);
    expect(isSimplePolygon(uShape.points!)).toBe(true);
    // bow tie: the two diagonals cross
    expect(isSimplePolygon([at(0, 0), at(200, 200), at(200, 0), at(0, 200)])).toBe(false);
    // repeated corner, flat line, too few corners
    expect(isSimplePolygon([at(0, 0), at(0, 200), at(0, 200), at(200, 0)])).toBe(false);
    expect(isSimplePolygon([at(0, 0), at(0, 100), at(0, 200)])).toBe(false);
    expect(isSimplePolygon([at(0, 0), at(0, 100)])).toBe(false);
  });
});

describe('polygon zone alerts', () => {
  const reading = (p: GeoPoint | null): Telemetry => ({
    helmet_connected: true,
    helmet_worn: null,
    latitude: p?.lat ?? null,
    longitude: p?.lon ?? null,
    speed_kmh: null,
    battery_percent: null,
    crash_detected: false,
  });
  const run = (zone: Geofence, path: (GeoPoint | null)[]) => {
    let conditions: Conditions = NO_CONDITIONS;
    return path.map((p) => {
      const result = evaluateTelemetry(conditions, reading(p), zone);
      conditions = result.conditions;
      return result.events;
    });
  };

  it('alerts once on exit and logs the return', () => {
    expect(run(square, [at(100, 100), at(100, 230), at(100, 300), at(100, 100), at(100, 90)])).toEqual([
      [], ['geofence_exit'], [], ['geofence_enter'], [],
    ]);
  });
  it('riding into the cut-out of a concave zone is an exit', () => {
    expect(run(lShape, [at(50, 50), at(200, 200), at(50, 250)])).toEqual([[], ['geofence_exit'], ['geofence_enter']]);
  });
  it('null or invalid GPS never alerts and never recovers', () => {
    expect(run(square, [at(100, 100), null, { lat: 0, lon: 0 }])).toEqual([[], [], []]);
    expect(run(square, [at(100, 230), null, { lat: 0, lon: 0 }])).toEqual([['geofence_exit'], [], []]);
  });
  it('does not flap on GPS jitter at the edge', () => {
    expect(run(square, [at(100, 195), at(100, 203), at(100, 197), at(100, 204), at(100, 180)])).toEqual([
      [], ['geofence_exit'], [], [], ['geofence_enter'],
    ]);
  });
});
