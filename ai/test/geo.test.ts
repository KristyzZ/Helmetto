import { describe, expect, it } from 'vitest';
import { checkGeofence, haversineMeters, isValidCoordinate, isValidGeofence } from '../src';

const VILNIUS = { latitude: 54.6872, longitude: 25.2797 };
const zone = { ...VILNIUS, radius_m: 300 };
/** ~111.2 m per 0.001 degree of latitude. */
const north = (meters: number) => VILNIUS.latitude + meters / 111_195;

describe('isValidCoordinate', () => {
  it('accepts normal coordinates', () => {
    expect(isValidCoordinate(54.6872, 25.2797)).toBe(true);
    expect(isValidCoordinate(-33.86, 151.2)).toBe(true);
  });
  it('rejects null, NaN, strings and out-of-range values', () => {
    expect(isValidCoordinate(null, 25)).toBe(false);
    expect(isValidCoordinate(54, null)).toBe(false);
    expect(isValidCoordinate(undefined, undefined)).toBe(false);
    expect(isValidCoordinate(NaN, 25)).toBe(false);
    expect(isValidCoordinate(Infinity, 25)).toBe(false);
    expect(isValidCoordinate('54', '25')).toBe(false);
    expect(isValidCoordinate(91, 25)).toBe(false);
    expect(isValidCoordinate(54, -181)).toBe(false);
  });
  it('rejects 0,0 (GPS without a fix)', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(0, 25)).toBe(true);
  });
});

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(54.6872, 25.2797, 54.6872, 25.2797)).toBe(0);
  });
  it('matches a known distance (Vilnius to Kaunas, ~92 km)', () => {
    const d = haversineMeters(54.6872, 25.2797, 54.8985, 23.9036);
    expect(d).toBeGreaterThan(90_000);
    expect(d).toBeLessThan(94_000);
  });
  it('one degree of latitude is ~111.2 km', () => {
    expect(haversineMeters(10, 20, 11, 20)).toBeCloseTo(111_195, -2);
  });
  it('is symmetric', () => {
    expect(haversineMeters(1, 2, 3, 4)).toBeCloseTo(haversineMeters(3, 4, 1, 2), 6);
  });
});

describe('checkGeofence', () => {
  it('inside at the center and within the radius', () => {
    expect(checkGeofence(zone, VILNIUS.latitude, VILNIUS.longitude)).toBe('inside');
    expect(checkGeofence(zone, north(290), VILNIUS.longitude)).toBe('inside');
  });
  it('outside beyond the radius', () => {
    expect(checkGeofence(zone, north(310), VILNIUS.longitude)).toBe('outside');
  });
  it('unknown without a geofence', () => {
    expect(checkGeofence(null, VILNIUS.latitude, VILNIUS.longitude)).toBe('unknown');
  });
  it('unknown when GPS is null or invalid', () => {
    expect(checkGeofence(zone, null, null)).toBe('unknown');
    expect(checkGeofence(zone, VILNIUS.latitude, null)).toBe('unknown');
    expect(checkGeofence(zone, 0, 0)).toBe('unknown');
    expect(checkGeofence(zone, 999, 25)).toBe('unknown');
  });
  it('unknown when the geofence itself is invalid', () => {
    expect(isValidGeofence({ ...VILNIUS, radius_m: 0 })).toBe(false);
    expect(checkGeofence({ ...VILNIUS, radius_m: -5 }, VILNIUS.latitude, VILNIUS.longitude)).toBe('unknown');
  });
});
