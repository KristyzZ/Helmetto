import { describe, expect, it } from 'vitest';
import type { Place } from '@helmetto/shared';
import { placeAt } from '../src';

const SCHOOL: Place = { id: 1, name: 'School', latitude: 54.6872, longitude: 25.2797, radius_m: 80 };
const SHOP: Place = { id: 2, name: 'Shop', latitude: 54.6872 + 150 / 111_195, longitude: 25.2797, radius_m: 100 };
/** ~111.2 m per 0.001 degree of latitude. */
const north = (meters: number) => SCHOOL.latitude + meters / 111_195;

describe('placeAt', () => {
  it('finds the place whose circle holds the reading', () => {
    expect(placeAt([SCHOOL], north(50), SCHOOL.longitude, null)).toBe(1);
    expect(placeAt([SCHOOL], north(120), SCHOOL.longitude, null)).toBe(null);
  });
  it('keeps the current place until the reading is clearly outside', () => {
    expect(placeAt([SCHOOL], north(95), SCHOOL.longitude, 1)).toBe(1); // 15 m past the edge: jitter
    expect(placeAt([SCHOOL], north(95), SCHOOL.longitude, null)).toBe(null); // not there yet
    expect(placeAt([SCHOOL], north(110), SCHOOL.longitude, 1)).toBe(null);
  });
  it('picks the nearest of overlapping places', () => {
    expect(placeAt([SCHOOL, SHOP], north(70), SCHOOL.longitude, null)).toBe(1);
    expect(placeAt([SCHOOL, SHOP], north(78), SCHOOL.longitude, null)).toBe(2);
  });
  it('keeps the last answer without a GPS fix', () => {
    expect(placeAt([SCHOOL], null, null, 1)).toBe(1);
    expect(placeAt([SCHOOL], 0, 0, null)).toBe(null);
  });
  it('lets go of a place that was deleted', () => {
    expect(placeAt([], north(10), SCHOOL.longitude, 1)).toBe(null);
  });
});
