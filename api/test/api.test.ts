import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AlertsResponse, DeviceState, DevicesResponse } from '@helmetto/shared';
import { createApp } from '../src/app';
import type { Config } from '../src/config';
import { Store } from '../src/db';
import { SafetyService } from '../src/service';

const config: Config = {
  port: 0,
  databasePath: ':memory:',
  device: { id: 'test-scooter', apiKey: 'test-key', name: 'Test scooter', childName: null },
  demoDevices: [],
  demoMode: false,
  offlineTimeoutMs: 30_000,
  webDist: '/nonexistent',
};

let now = 1_700_000_000_000;
let base = '';
let close: () => void;
let service: SafetyService;

const reading = (over: Record<string, unknown> = {}) => ({
  helmet_connected: true,
  helmet_worn: null,
  latitude: null,
  longitude: null,
  speed_kmh: null,
  battery_percent: null,
  crash_detected: false,
  ...over,
});

const post = (body: unknown, key: string | null = 'test-key', device = 'test-scooter') =>
  fetch(`${base}/api/devices/${device}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Device-Key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const state = async () => (await (await fetch(`${base}/api/devices/test-scooter/state`)).json()) as DeviceState;
const alertTypes = async () =>
  ((await (await fetch(`${base}/api/devices/test-scooter/alerts`)).json()) as AlertsResponse).alerts
    .map((a) => a.type)
    .reverse();

beforeAll(async () => {
  const store = new Store(':memory:');
  store.seedDevice(config.device);
  service = new SafetyService(store, { offlineTimeoutMs: config.offlineTimeoutMs, now: () => now });
  const server = createApp({ config, store, service }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

describe('telemetry auth and validation', () => {
  it('rejects a missing or wrong key and an unknown device', async () => {
    expect((await post(reading(), null)).status).toBe(401);
    expect((await post(reading(), 'nope')).status).toBe(401);
    expect((await post(reading(), 'test-key', 'ghost')).status).toBe(404);
  });

  it('rejects bad payloads with a clear 400', async () => {
    const missing = await post({ helmet_worn: null });
    expect(missing.status).toBe(400);
    const body = (await missing.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_payload');
    expect(body.message).toContain('helmet_connected');

    expect((await post(reading({ helmet_connected: 'yes' }))).status).toBe(400);
    expect((await post(reading({ battery_percent: 140 }))).status).toBe(400);
    expect((await post('{not json')).status).toBe(400);
  });

  it('a device that never reported is neither online nor alerting', async () => {
    const s = await state();
    expect(s.online).toBe(false);
    expect(s.last_seen_at).toBeNull();
    expect(s.telemetry).toBeNull();
    expect(s.active_alerts).toEqual([]);
  });

  it('accepts the documented payload; nulls stay null', async () => {
    expect((await post(reading())).status).toBe(200);
    const s = await state();
    expect(s.online).toBe(true);
    expect(s.telemetry?.helmet_worn).toBeNull();
    expect(s.telemetry?.speed_kmh).toBeNull();
    expect(s.zone_status).toBe('unknown');
  });

  it('accepts omitted optional fields and ignores unknown ones', async () => {
    expect((await post({ helmet_connected: true, future_field: 1 })).status).toBe(200);
  });
});

describe('alerts fire on transitions only', () => {
  it('one helmet alert for many identical readings, then one recovery', async () => {
    for (let i = 0; i < 4; i++) await post(reading({ helmet_connected: false }));
    expect((await state()).active_alerts).toEqual(['unprotected_use']);
    await post(reading());
    await post(reading());
    expect(await alertTypes()).toEqual(['unprotected_use', 'protection_restored']);
    expect((await state()).active_alerts).toEqual([]);
  });

  it('scooter offline after 30 s of silence, once, distinct from helmet state', async () => {
    now += 29_000;
    service.sweepOffline();
    expect((await state()).online).toBe(true);
    now += 2_000;
    service.sweepOffline();
    service.sweepOffline();
    const s = await state();
    expect(s.online).toBe(false);
    expect(s.active_alerts).toEqual(['scooter_offline']);
    expect(s.telemetry?.helmet_connected).toBe(true); // last known, not "disconnected"

    await post(reading());
    expect((await state()).online).toBe(true);
    expect((await alertTypes()).slice(-2)).toEqual(['scooter_offline', 'scooter_online']);
  });

  it('geofence: set zone, exit once, come back; invalid GPS is ignored', async () => {
    const put = await fetch(`${base}/api/devices/test-scooter/geofence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 54.6872, longitude: 25.2797, radius_m: 200 }),
    });
    expect(put.status).toBe(200);

    await post(reading({ latitude: 54.6872, longitude: 25.2797 }));
    expect((await state()).zone_status).toBe('inside');
    await post(reading({ latitude: 54.6972, longitude: 25.2797 })); // ~1.1 km north
    await post(reading({ latitude: 54.6973, longitude: 25.2797 }));
    await post(reading({ latitude: 0, longitude: 0 })); // no fix
    let s = await state();
    expect(s.active_alerts).toEqual(['geofence_exit']);
    expect(s.telemetry?.latitude).toBeNull();
    expect(s.last_location?.latitude).toBeCloseTo(54.6973, 4);
    await post(reading({ latitude: 54.6873, longitude: 25.2797 }));
    s = await state();
    expect(s.active_alerts).toEqual([]);
    expect((await alertTypes()).slice(-2)).toEqual(['geofence_exit', 'geofence_enter']);
  });

  it('rejects an invalid geofence', async () => {
    const res = await fetch(`${base}/api/devices/test-scooter/geofence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 54, longitude: 25, radius_m: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('lists devices', async () => {
    const { devices } = (await (await fetch(`${base}/api/devices`)).json()) as DevicesResponse;
    expect(devices.map((d) => d.device_id)).toEqual(['test-scooter']);
  });
});

describe('polygon safe zone', () => {
  // ~220 m x ~130 m rectangle around 54.6872, 25.2797
  const points = [
    { lat: 54.6862, lon: 25.2787 },
    { lat: 54.6862, lon: 25.2807 },
    { lat: 54.6882, lon: 25.2807 },
    { lat: 54.6882, lon: 25.2787 },
  ];
  const put = (body: unknown) =>
    fetch(`${base}/api/devices/test-scooter/geofence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('rejects too few or too many points, bad coordinates, crossing lines and tiny shapes', async () => {
    const two = await put({ shape: 'polygon', points: points.slice(0, 2) });
    expect(two.status).toBe(400);
    expect(((await two.json()) as { message: string }).message).toContain('at least 3');

    const many = Array.from({ length: 51 }, (_, i) => ({ lat: 54.68 + i * 0.0001, lon: 25.27 + (i % 2) * 0.001 }));
    expect((await put({ shape: 'polygon', points: many })).status).toBe(400);

    expect((await put({ shape: 'polygon', points: [...points.slice(0, 3), { lat: 91, lon: 25 }] })).status).toBe(400);
    expect((await put({ shape: 'polygon', points: [...points.slice(0, 3), { lat: '54', lon: 25 }] })).status).toBe(400);

    const bowTie = await put({ shape: 'polygon', points: [points[0], points[2], points[1], points[3]] });
    expect(bowTie.status).toBe(400);
    expect(((await bowTie.json()) as { message: string }).message).toContain('crosses itself');

    const tiny = points.map((p) => ({ lat: 54.6872 + (p.lat - 54.6872) / 100, lon: 25.2797 + (p.lon - 25.2797) / 100 }));
    expect((await put({ shape: 'polygon', points: tiny })).status).toBe(400);
  });

  it('stores the polygon and fills the circle fields with an enclosing circle', async () => {
    const res = await put({ shape: 'polygon', points });
    expect(res.status).toBe(200);
    const { geofence } = (await res.json()) as DeviceState;
    expect(geofence?.shape).toBe('polygon');
    expect(geofence?.points).toEqual(points);
    expect(geofence?.latitude).toBeCloseTo(54.6872, 4);
    expect(geofence?.longitude).toBeCloseTo(25.2797, 4);
    expect(geofence?.radius_m).toBeGreaterThan(100);
    expect((await state()).geofence).toEqual(geofence);
  });

  it('exit and enter fire once each, and the corner outside the shape counts as outside', async () => {
    const before = (await alertTypes()).length;
    await post(reading({ latitude: 54.6872, longitude: 25.2797 }));
    expect((await state()).zone_status).toBe('inside');
    // inside the enclosing circle but outside the rectangle
    for (let i = 0; i < 3; i++) await post(reading({ latitude: 54.6872, longitude: 25.2812 }));
    expect((await state()).active_alerts).toEqual(['geofence_exit']);
    await post(reading({ latitude: null, longitude: null }));
    expect((await state()).active_alerts).toEqual(['geofence_exit']);
    for (let i = 0; i < 2; i++) await post(reading({ latitude: 54.6872, longitude: 25.2797 }));
    expect((await alertTypes()).slice(before)).toEqual(['geofence_exit', 'geofence_enter']);
  });

  it('old circle bodies still work and replace the polygon', async () => {
    const res = await put({ latitude: 54.6872, longitude: 25.2797, radius_m: 200 });
    expect(res.status).toBe(200);
    const { geofence } = (await res.json()) as DeviceState;
    expect(geofence).toEqual({ latitude: 54.6872, longitude: 25.2797, radius_m: 200, shape: 'circle' });
    expect((await put({ shape: 'circle', latitude: 54.6872, longitude: 25.2797, radius_m: 200 })).status).toBe(200);
    const bad = await put({ latitude: 54.6872, longitude: 25.2797, radius_m: 1 });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toContain('radius_m');
  });
});

describe('device names', () => {
  const patch = (body: unknown) =>
    fetch(`${base}/api/devices/test-scooter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('sets the child name and uses it in alert messages', async () => {
    expect((await state()).child_name).toBeNull();
    const res = await patch({ child_name: '  Emma ' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as DeviceState).child_name).toBe('Emma');
    await post(reading({ helmet_connected: false }));
    await post(reading());
    const { alerts } = (await (await fetch(`${base}/api/devices/test-scooter/alerts?limit=2`)).json()) as AlertsResponse;
    expect(alerts[1]?.message).toBe('Emma (Test scooter): in use without helmet.');
  });

  it('renames the scooter, clears the child name, rejects empty updates', async () => {
    expect(((await (await patch({ name: 'Blue scooter', child_name: null })).json()) as DeviceState)).toMatchObject({
      name: 'Blue scooter',
      child_name: null,
    });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: '' })).status).toBe(400);
    expect((await patch({ name: 'x'.repeat(41) })).status).toBe(400);
  });
});

describe('equipment and gear', () => {
  const patch = (body: unknown, device = 'test-scooter') =>
    fetch(`${base}/api/devices/${device}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  /** All three tags on, with optional overrides per type. */
  const gearOn = (over: Record<string, object> = {}) =>
    [
      { type: 'helmet', connected: true, worn: true },
      { type: 'chaps', connected: true, worn: true },
      { type: 'ear_protection', connected: true, worn: null },
    ].map((g) => ({ ...g, ...over[g.type] }));

  it('configures the device as a chainsaw with auto-lock', async () => {
    const res = await patch({
      kind: 'chainsaw',
      operator_name: 'Mantas',
      site: 'Forest plot 12',
      required_gear: ['helmet', 'chaps', 'ear_protection'],
      auto_lock: true,
    });
    expect(res.status).toBe(200);
    const s = (await res.json()) as DeviceState;
    expect(s).toMatchObject({ kind: 'chainsaw', operator_name: 'Mantas', child_name: 'Mantas', site: 'Forest plot 12', auto_lock: true });
    expect(s.required_gear).toEqual(['helmet', 'chaps', 'ear_protection']);
  });

  it('rejects unknown kinds and gear types', async () => {
    expect((await patch({ kind: 'tractor' })).status).toBe(400);
    expect((await patch({ required_gear: ['cape'] })).status).toBe(400);
    expect((await post(reading({ gear: [{ type: 'cape', connected: true }] }))).status).toBe(400);
    expect((await post(reading({ gear: [{ type: 'chaps' }] }))).status).toBe(400);
  });

  it('per-item gear status; no alert while the saw is off', async () => {
    const before = (await alertTypes()).length;
    const res = await post(reading({ equipment_active: false, gear: gearOn({ chaps: { connected: false } }) }));
    expect(((await res.json()) as { lock: boolean }).lock).toBe(true); // auto-lock: gear missing
    const s = await state();
    expect(s.in_use).toBe(false);
    expect(s.lock_engaged).toBe(true);
    expect(s.gear_status).toEqual([
      { type: 'helmet', state: 'ok' },
      { type: 'chaps', state: 'missing' },
      { type: 'ear_protection', state: 'ok' },
    ]);
    expect((await alertTypes()).length - before).toBe(1); // locked for missing chaps counts as unprotected
  });

  it('running without chaps: one alert, lock stays on, recovery when chaps are back', async () => {
    await post(reading({ equipment_active: true, gear: gearOn() }));
    const before = (await alertTypes()).length;
    const first = await post(reading({ equipment_active: true, gear: gearOn({ chaps: { connected: false } }) }));
    expect(((await first.json()) as { lock: boolean }).lock).toBe(true);
    await post(reading({ equipment_active: false, locked: true, gear: gearOn({ chaps: { connected: false } }) }));
    await post(reading({ equipment_active: false, locked: true, gear: gearOn({ chaps: { connected: false } }) }));
    expect((await state()).active_alerts).toEqual(['unprotected_use']);
    const back = await post(reading({ equipment_active: false, locked: true, gear: gearOn() }));
    expect(((await back.json()) as { lock: boolean }).lock).toBe(false);
    const { alerts } = (await (await fetch(`${base}/api/devices/test-scooter/alerts?limit=5`)).json()) as AlertsResponse;
    expect(alerts.slice(0, 2).map((a) => a.type)).toEqual(['protection_restored', 'unprotected_use']);
    expect(alerts[1]?.message).toBe('Mantas (Blue scooter): running without chaps. Locked until it is back.');
    expect(alerts[0]?.message).toBe('Mantas (Blue scooter): all required gear is back on.');
    expect((await alertTypes()).length - before).toBe(2);
  });

  it('dropping a required item ends its alert right away', async () => {
    await post(reading({ equipment_active: true, gear: gearOn({ ear_protection: { connected: false } }) }));
    expect((await state()).active_alerts).toEqual(['unprotected_use']);
    await patch({ required_gear: ['helmet', 'chaps'] });
    expect((await state()).active_alerts).toEqual([]);
    await patch({ kind: 'other', operator_name: null, site: null, required_gear: ['helmet'], auto_lock: false });
  });
});

describe('SSE stream', () => {
  it('sends a snapshot, then state and alert events', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    };
    await readUntil('event: hello');
    await post(reading({ crash_detected: true }));
    await readUntil('event: alert');
    expect(text).toContain('event: state');
    expect(text).toContain('"type":"crash_detected"');
    controller.abort();
  });
});
