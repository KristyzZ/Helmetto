import { describe, expect, it } from 'vitest';
import type { Telemetry } from '@helmetto/shared';
import { checkProtection, compliance, dayOf, exposureBetween, lastDays, sumStats } from '../src';

describe('exposureBetween', () => {
  it('credits the time since the previous reading to its state', () => {
    expect(exposureBetween({ at: 0, inUse: true, unprotected: false }, 5_000)).toEqual({ in_use_s: 5, unprotected_s: 0 });
    expect(exposureBetween({ at: 0, inUse: true, unprotected: true }, 5_000)).toEqual({ in_use_s: 5, unprotected_s: 5 });
  });
  it('nothing while not in use, for the first reading, or for clocks going backwards', () => {
    expect(exposureBetween({ at: 0, inUse: false, unprotected: false }, 5_000)).toEqual({ in_use_s: 0, unprotected_s: 0 });
    expect(exposureBetween(null, 5_000)).toEqual({ in_use_s: 0, unprotected_s: 0 });
    expect(exposureBetween({ at: 9_000, inUse: true, unprotected: true }, 5_000)).toEqual({ in_use_s: 0, unprotected_s: 0 });
  });
  it('caps long gaps (offline) at the max gap', () => {
    expect(exposureBetween({ at: 0, inUse: true, unprotected: true }, 600_000)).toEqual({ in_use_s: 15, unprotected_s: 15 });
  });
});

describe('compliance', () => {
  it('is the protected share of in-use time', () => {
    expect(compliance(100, 0)).toBe(1);
    expect(compliance(100, 25)).toBe(0.75);
    expect(compliance(100, 100)).toBe(0);
  });
  it('is null when the equipment was not used', () => {
    expect(compliance(0, 0)).toBeNull();
  });
});

describe('sumStats', () => {
  it('adds time, incidents and missed gear, then recomputes compliance', () => {
    const total = sumStats([
      { in_use_s: 60, unprotected_s: 0, incidents: 0, missed: {} },
      { in_use_s: 40, unprotected_s: 20, incidents: 2, missed: { chaps: 1, gloves: 1 } },
      { in_use_s: 0, unprotected_s: 0, incidents: 1, missed: { chaps: 1 } },
    ]);
    expect(total).toEqual({ in_use_s: 100, unprotected_s: 20, incidents: 3, compliance: 0.8, missed: { chaps: 2, gloves: 1 } });
  });
});

describe('days', () => {
  it('lists UTC days oldest first', () => {
    const now = Date.parse('2026-11-13T10:00:00Z');
    expect(dayOf(now)).toBe('2026-11-13');
    expect(lastDays(now, 3)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });
});

describe('manual lock', () => {
  const reading = (over: Partial<Telemetry> = {}): Telemetry => ({
    helmet_connected: true, helmet_worn: null, latitude: null, longitude: null,
    speed_kmh: null, battery_percent: null, crash_detected: false, ...over,
  });
  const profile = { requiredGear: ['eye_protection' as const], autoLock: false };
  it('locks with all gear on, and is not a safety alert', () => {
    const r = checkProtection(reading({ equipment_active: true }), { ...profile, manualLock: true });
    expect(r.lock).toBe(true);
    expect(r.gearLock).toBe(false);
    expect(r.unprotected).toBe(false);
  });
  it('a manual lock alone does not keep a "No protection" alert alive once the tool stops', () => {
    const r = checkProtection(reading({ equipment_active: false, locked: true, helmet_connected: false }), { ...profile, manualLock: true });
    expect(r.unprotected).toBe(false);
  });
});
