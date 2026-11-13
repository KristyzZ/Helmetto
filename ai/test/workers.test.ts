import { describe, expect, it } from 'vitest';
import type { DeviceState } from '@helmetto/shared';
import { initials, nextWorkerTag, stationOf } from '../src';

const device = (id: string, over: Partial<DeviceState>): DeviceState =>
  ({
    device_id: id, name: id, online: true, last_seen_at: '2026-11-13T10:00:00Z', telemetry: null, last_location: null,
    active_alerts: [], geofence: null, zone_status: 'unknown', server_time: '2026-11-13T10:00:05Z', worker_id: null, ...over,
  }) as DeviceState;

describe('stationOf', () => {
  it('finds the equipment that identified the worker', () => {
    const devices = [device('grinder', { worker_id: 'w1' }), device('saw', { worker_id: 'w2' })];
    expect(stationOf('w2', devices)?.device_id).toBe('saw');
  });
  it('is null when nobody identified them, or that equipment is offline', () => {
    expect(stationOf('w3', [device('grinder', { worker_id: 'w1' })])).toBeNull();
    expect(stationOf('w1', [device('grinder', { worker_id: 'w1', online: false })])).toBeNull();
  });
  it('picks the most recent when two stations report the same worker', () => {
    const devices = [
      device('grinder', { worker_id: 'w1', last_seen_at: '2026-11-13T10:00:00Z' }),
      device('welder', { worker_id: 'w1', last_seen_at: '2026-11-13T10:00:04Z' }),
    ];
    expect(stationOf('w1', devices)?.device_id).toBe('welder');
  });
});

describe('helpers', () => {
  it('initials', () => {
    expect(initials('Tomas Petraitis')).toBe('TP');
    expect(initials('  rūta ')).toBe('R');
  });
  it('next free tag', () => {
    expect(nextWorkerTag([])).toBe('TAG-0001');
    expect(nextWorkerTag(['TAG-0001', 'tag-0002', 'TAG-0004'])).toBe('TAG-0003');
  });
});
