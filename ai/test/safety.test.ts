import { describe, expect, it } from 'vitest';
import type { Telemetry } from '@helmetto/shared';
import {
  NO_CONDITIONS,
  activeAlerts,
  detectTransitions,
  evaluateGeofenceChange,
  evaluateHeartbeat,
  evaluateTelemetry,
  isOffline,
  type Conditions,
} from '../src';

const CENTER = { latitude: 54.6872, longitude: 25.2797 };
const zone = { ...CENTER, radius_m: 300 };
const north = (meters: number) => CENTER.latitude + meters / 111_195;

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

/** Feed readings in order, collecting the events of each step. */
function run(readings: Telemetry[], geofence = null as typeof zone | null, start: Conditions = NO_CONDITIONS) {
  let conditions = start;
  const steps = readings.map((r) => {
    const result = evaluateTelemetry(conditions, r, geofence);
    conditions = result.conditions;
    return result.events;
  });
  return { conditions, steps };
}

describe('isOffline', () => {
  it('is false within the timeout and true after it', () => {
    expect(isOffline(1_000, 31_000)).toBe(false);
    expect(isOffline(1_000, 31_001)).toBe(true);
  });
  it('never-seen devices are not offline', () => {
    expect(isOffline(null, 999_999)).toBe(false);
  });
  it('honours a custom timeout', () => {
    expect(isOffline(0, 600, 500)).toBe(true);
  });
});

describe('helmet connection transitions', () => {
  it('alerts once when the helmet disconnects, not on every reading', () => {
    const { steps } = run([
      reading(),
      reading({ helmet_connected: false }),
      reading({ helmet_connected: false }),
      reading({ helmet_connected: false }),
    ]);
    expect(steps).toEqual([[], ['helmet_disconnected'], [], []]);
  });
  it('logs the reconnect, then alerts again on a new disconnect', () => {
    const { steps } = run([
      reading({ helmet_connected: false }),
      reading(),
      reading(),
      reading({ helmet_connected: false }),
    ]);
    expect(steps).toEqual([['helmet_disconnected'], ['helmet_reconnected'], [], ['helmet_disconnected']]);
  });
  it('a normal first reading produces no events', () => {
    expect(evaluateTelemetry(NO_CONDITIONS, reading(), null).events).toEqual([]);
  });
});

describe('helmet worn', () => {
  it('null (no sensor) is never treated as "not worn"', () => {
    const { steps, conditions } = run([reading({ helmet_worn: null }), reading({ helmet_worn: null })]);
    expect(steps).toEqual([[], []]);
    expect(conditions.helmet_not_worn).toBe(false);
  });
  it('alerts once on not worn and logs recovery', () => {
    const { steps } = run([
      reading({ helmet_worn: true }),
      reading({ helmet_worn: false }),
      reading({ helmet_worn: false }),
      reading({ helmet_worn: true }),
    ]);
    expect(steps).toEqual([[], ['helmet_not_worn'], [], ['helmet_worn']]);
  });
  it('a null reading keeps the previous condition without a new event', () => {
    const { steps, conditions } = run([reading({ helmet_worn: false }), reading({ helmet_worn: null })]);
    expect(steps).toEqual([['helmet_not_worn'], []]);
    expect(conditions.helmet_not_worn).toBe(true);
  });
});

describe('crash', () => {
  it('alerts once while the flag stays up, then clears', () => {
    const { steps } = run([
      reading(),
      reading({ crash_detected: true }),
      reading({ crash_detected: true }),
      reading({ crash_detected: false }),
    ]);
    expect(steps).toEqual([[], ['crash_detected'], [], ['crash_cleared']]);
  });
  it('null (no accelerometer) is not a crash', () => {
    expect(evaluateTelemetry(NO_CONDITIONS, reading({ crash_detected: null }), null).events).toEqual([]);
  });
});

describe('geofence', () => {
  const at = (meters: number) => reading({ latitude: north(meters), longitude: CENTER.longitude });

  it('alerts once on exit and logs the return', () => {
    const { steps } = run([at(100), at(320), at(400), at(100), at(50)], zone);
    expect(steps).toEqual([[], ['geofence_exit'], [], ['geofence_enter'], []]);
  });
  it('ignores the check when GPS is null: no exit, no false recovery', () => {
    const inside = run([at(100), reading(), reading()], zone);
    expect(inside.steps).toEqual([[], [], []]);
    const outside = run([at(320), reading(), reading({ latitude: 0, longitude: 0 })], zone);
    expect(outside.steps).toEqual([['geofence_exit'], [], []]);
    expect(outside.conditions.geofence_exit).toBe(true);
  });
  it('ignores invalid coordinates', () => {
    const { steps } = run([at(100), reading({ latitude: 500, longitude: 500 })], zone);
    expect(steps).toEqual([[], []]);
  });
  it('never alerts without a geofence', () => {
    expect(run([at(100), at(5_000)], null).steps).toEqual([[], []]);
  });
  it('does not flap on GPS jitter at the boundary', () => {
    const { steps } = run([at(295), at(303), at(297), at(304), at(296), at(280)], zone);
    expect(steps).toEqual([[], ['geofence_exit'], [], [], [], ['geofence_enter']]);
  });
});

describe('offline', () => {
  it('goes offline once after the timeout', () => {
    const first = evaluateHeartbeat(NO_CONDITIONS, 0, 31_000);
    expect(first.events).toEqual(['scooter_offline']);
    expect(evaluateHeartbeat(first.conditions, 0, 60_000).events).toEqual([]);
  });
  it('does nothing before the timeout or for never-seen devices', () => {
    expect(evaluateHeartbeat(NO_CONDITIONS, 0, 29_000).events).toEqual([]);
    expect(evaluateHeartbeat(NO_CONDITIONS, null, 99_000).events).toEqual([]);
  });
  it('new telemetry brings the scooter back online', () => {
    const offline = evaluateHeartbeat(NO_CONDITIONS, 0, 31_000).conditions;
    expect(evaluateTelemetry(offline, reading(), null).events).toEqual(['scooter_online']);
  });
  it('keeps "helmet disconnected" separate from "scooter offline"', () => {
    const helmetOff = evaluateTelemetry(NO_CONDITIONS, reading({ helmet_connected: false }), null).conditions;
    const offline = evaluateHeartbeat(helmetOff, 0, 31_000);
    expect(offline.events).toEqual(['scooter_offline']);
    expect(activeAlerts(offline.conditions).sort()).toEqual(['helmet_disconnected', 'scooter_offline']);
    // back online with the helmet connected: both recoveries, online first
    expect(evaluateTelemetry(offline.conditions, reading(), null).events).toEqual([
      'scooter_online',
      'helmet_reconnected',
    ]);
  });
});

describe('detectTransitions', () => {
  it('returns nothing for identical conditions', () => {
    expect(detectTransitions(NO_CONDITIONS, { ...NO_CONDITIONS })).toEqual([]);
  });
  it('reports several simultaneous changes', () => {
    const events = evaluateTelemetry(
      NO_CONDITIONS,
      reading({ helmet_connected: false, crash_detected: true }),
      null,
    ).events;
    expect(events).toEqual(['crash_detected', 'helmet_disconnected']);
  });
});

describe('evaluateGeofenceChange', () => {
  const far = reading({ latitude: north(1_000), longitude: CENTER.longitude });
  it('alerts when a new zone excludes the last position', () => {
    expect(evaluateGeofenceChange(NO_CONDITIONS, far, zone).events).toEqual(['geofence_exit']);
  });
  it('clears silently when the zone is removed', () => {
    const outside = { ...NO_CONDITIONS, geofence_exit: true };
    const result = evaluateGeofenceChange(outside, far, null);
    expect(result.events).toEqual([]);
    expect(result.conditions.geofence_exit).toBe(false);
  });
  it('recovers when the zone is widened to include the scooter', () => {
    const outside = { ...NO_CONDITIONS, geofence_exit: true };
    expect(evaluateGeofenceChange(outside, far, { ...zone, radius_m: 2_000 }).events).toEqual(['geofence_enter']);
  });
});
