import { describe, expect, it } from 'vitest';
import type { GearReading, Telemetry } from '@helmetto/shared';
import {
  NO_CONDITIONS,
  checkProtection,
  evaluateProfileChange,
  evaluateTelemetry,
  gearStatus,
  isInUse,
  type Conditions,
  type EquipmentProfile,
} from '../src';

const reading = (over: Partial<Telemetry> = {}): Telemetry => ({
  helmet_connected: true,
  helmet_worn: null,
  latitude: null,
  longitude: null,
  speed_kmh: null,
  battery_percent: null,
  crash_detected: false,
  ...over,
});

const grinder: EquipmentProfile = { requiredGear: ['eye_protection', 'ear_protection', 'gloves'], autoLock: false };
const chainsaw: EquipmentProfile = { requiredGear: ['helmet', 'chaps', 'ear_protection'], autoLock: true };
const boat: EquipmentProfile = { requiredGear: ['life_jacket'], autoLock: false };

const allOn = (profile: EquipmentProfile): GearReading[] =>
  profile.requiredGear.map((type) => ({ type, connected: true, worn: true }));
const without = (profile: EquipmentProfile, type: string, how: 'missing' | 'not_worn' = 'missing'): GearReading[] =>
  allOn(profile).map((g) => (g.type !== type ? g : how === 'missing' ? { ...g, connected: false } : { ...g, worn: false }));

function run(profile: EquipmentProfile, readings: Telemetry[]) {
  let conditions: Conditions = NO_CONDITIONS;
  const steps = readings.map((r) => {
    const result = evaluateTelemetry(conditions, r, null, profile);
    conditions = result.conditions;
    return result.events;
  });
  return { conditions, steps };
}

describe('gearStatus', () => {
  it('reads each required item from the gear array', () => {
    const status = gearStatus(reading({ gear: without(grinder, 'gloves') }), grinder.requiredGear);
    expect(status).toEqual([
      { type: 'eye_protection', state: 'ok' },
      { type: 'ear_protection', state: 'ok' },
      { type: 'gloves', state: 'missing' },
    ]);
  });
  it('a tag in range but not worn is "not_worn"', () => {
    const status = gearStatus(reading({ gear: without(boat, 'life_jacket', 'not_worn') }), boat.requiredGear);
    expect(status).toEqual([{ type: 'life_jacket', state: 'not_worn' }]);
  });
  it('required gear with no tag is "unknown", never missing', () => {
    const status = gearStatus(reading({ gear: [{ type: 'helmet', connected: true }] }), chainsaw.requiredGear);
    expect(status.map((s) => s.state)).toEqual(['ok', 'unknown', 'unknown']);
  });
  it('single-tag hardware: helmet_connected describes the first required item', () => {
    expect(gearStatus(reading({ helmet_connected: false }), grinder.requiredGear).map((s) => s.state)).toEqual([
      'missing',
      'unknown',
      'unknown',
    ]);
    expect(gearStatus(reading({ helmet_worn: false }), boat.requiredGear)).toEqual([{ type: 'life_jacket', state: 'not_worn' }]);
    expect(gearStatus(reading(), boat.requiredGear)).toEqual([{ type: 'life_jacket', state: 'ok' }]);
  });
  it('an empty gear array falls back to the single-tag fields', () => {
    expect(gearStatus(reading({ gear: [], helmet_connected: false }), boat.requiredGear)[0]?.state).toBe('missing');
  });
});

describe('isInUse', () => {
  it('follows equipment_active; unknown counts as in use', () => {
    expect(isInUse(reading({ equipment_active: true }))).toBe(true);
    expect(isInUse(reading({ equipment_active: false }))).toBe(false);
    expect(isInUse(reading({ equipment_active: null }))).toBe(true);
    expect(isInUse(reading())).toBe(true);
  });
  it('locked equipment is not in use', () => {
    expect(isInUse(reading({ equipment_active: null, locked: true }))).toBe(false);
  });
});

describe('No protection alert', () => {
  it('fires once when gear goes missing while running, then recovers', () => {
    const { steps } = run(grinder, [
      reading({ equipment_active: true, gear: allOn(grinder) }),
      reading({ equipment_active: true, gear: without(grinder, 'eye_protection') }),
      reading({ equipment_active: true, gear: without(grinder, 'eye_protection') }),
      reading({ equipment_active: true, gear: without(grinder, 'gloves') }), // still unsafe: no new alert
      reading({ equipment_active: true, gear: allOn(grinder) }),
    ]);
    expect(steps).toEqual([[], ['unprotected_use'], [], [], ['protection_restored']]);
  });
  it('no alert when the equipment is off, whatever the gear does', () => {
    const { steps } = run(grinder, [
      reading({ equipment_active: false, gear: allOn(grinder) }),
      reading({ equipment_active: false, gear: without(grinder, 'eye_protection') }),
      reading({ equipment_active: false, gear: grinder.requiredGear.map((type) => ({ type, connected: false })) }),
    ]);
    expect(steps).toEqual([[], [], []]);
  });
  it('switching the tool on without gear alerts; switching it off ends it', () => {
    const { steps } = run(grinder, [
      reading({ equipment_active: false, gear: without(grinder, 'ear_protection') }),
      reading({ equipment_active: true, gear: without(grinder, 'ear_protection') }),
      reading({ equipment_active: false, gear: without(grinder, 'ear_protection') }),
    ]);
    expect(steps).toEqual([[], ['unprotected_use'], ['protection_restored']]);
  });
  it('boat under way with the life jacket not worn', () => {
    const { steps } = run(boat, [
      reading({ equipment_active: true, gear: allOn(boat) }),
      reading({ equipment_active: true, gear: without(boat, 'life_jacket', 'not_worn') }),
      reading({ equipment_active: false, gear: without(boat, 'life_jacket', 'not_worn') }), // moored
    ]);
    expect(steps).toEqual([[], ['unprotected_use'], ['protection_restored']]);
  });
  it('unknown gear (no tag) never alerts', () => {
    const { steps } = run(chainsaw, [reading({ equipment_active: true, gear: [{ type: 'helmet', connected: true }] })]);
    expect(steps).toEqual([[]]);
  });
});

describe('auto-lock', () => {
  it('asks to lock while gear is missing, even before the saw starts', () => {
    expect(checkProtection(reading({ equipment_active: false, gear: without(chainsaw, 'chaps') }), chainsaw).lock).toBe(true);
    expect(checkProtection(reading({ equipment_active: true, gear: allOn(chainsaw) }), chainsaw).lock).toBe(false);
    expect(checkProtection(reading({ equipment_active: true, gear: without(grinder, 'gloves') }), grinder).lock).toBe(false);
  });
  it('locking the saw keeps the alert active instead of looking like a recovery', () => {
    const { steps, conditions } = run(chainsaw, [
      reading({ equipment_active: true, gear: allOn(chainsaw) }),
      reading({ equipment_active: true, gear: without(chainsaw, 'chaps') }),
      reading({ equipment_active: false, locked: true, gear: without(chainsaw, 'chaps') }),
      reading({ equipment_active: false, locked: true, gear: without(chainsaw, 'chaps') }),
    ]);
    expect(steps).toEqual([[], ['unprotected_use'], [], []]);
    expect(conditions.unprotected_use).toBe(true);
  });
  it('putting the chaps back on unlocks and recovers', () => {
    const r = checkProtection(reading({ equipment_active: false, locked: true, gear: allOn(chainsaw) }), chainsaw);
    expect(r.lock).toBe(false);
    expect(r.unprotected).toBe(false);
  });
});

describe('evaluateProfileChange', () => {
  it('adding a required item that is missing raises the alert', () => {
    const last = reading({ equipment_active: true, gear: [{ type: 'eye_protection', connected: true }, { type: 'gloves', connected: false }] });
    const before = evaluateTelemetry(NO_CONDITIONS, last, null, { requiredGear: ['eye_protection'], autoLock: false });
    expect(before.events).toEqual([]);
    const after = evaluateProfileChange(before.conditions, last, { requiredGear: ['eye_protection', 'gloves'], autoLock: false });
    expect(after.events).toEqual(['unprotected_use']);
  });
  it('without a live reading the alert is cleared silently', () => {
    const r = evaluateProfileChange({ ...NO_CONDITIONS, unprotected_use: true }, null, grinder);
    expect(r.events).toEqual([]);
    expect(r.conditions.unprotected_use).toBe(false);
  });
});
