import {
  DEVICE_KEY_HEADER,
  TELEMETRY_INTERVAL_MS,
  routes,
  type DemoScenario,
  type DeviceState,
  type Geofence,
  type Telemetry,
} from '@helmetto/shared';

export interface SimulatorOptions {
  /** e.g. http://localhost:3000 or the deployed https URL. */
  baseUrl: string;
  deviceId: string;
  apiKey: string;
  intervalMs?: number;
  /** Where the mock ride happens when no safe zone is set. */
  home?: { latitude: number; longitude: number };
  /**
   * Send only what the current ESP8266 hardware can measure: helmet_connected,
   * everything else null. Useful to see the app's "unknown" states.
   */
  minimal?: boolean;
  log?: (line: string) => void;
}

/** Vilnius old town. Mock coordinates until the hardware has GPS. */
export const DEFAULT_HOME = { latitude: 54.6872, longitude: 25.2797 };
const DEFAULT_ZONE_RADIUS_M = 250;
const LOOP_RADIUS_M = 120;
const METERS_PER_DEG_LAT = 111_320;

/**
 * A fake scooter. It sends real HTTP telemetry to the real endpoint with the
 * real device key, so mock data takes exactly the same path as hardware.
 */
export class Simulator {
  scenario: DemoScenario = 'normal';

  private readonly intervalMs: number;
  private readonly log: (line: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  // ride state
  private center: { latitude: number; longitude: number };
  private zoneRadius = DEFAULT_ZONE_RADIUS_M;
  private angle = 0; // position on the loop, radians
  private escapeDistance: number | null = null; // meters from center when leaving the zone
  private helmetConnected = true;
  private helmetWorn = true;
  private crashTicks = 0;
  private stopped = false;
  private sending = true;
  private battery = 86;

  constructor(private options: SimulatorOptions) {
    this.intervalMs = options.intervalMs ?? TELEMETRY_INTERVAL_MS;
    this.log = options.log ?? (() => {});
    this.center = options.home ?? DEFAULT_HOME;
  }

  start(scenario: DemoScenario = 'normal'): void {
    this.stop();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.setScenario(scenario);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Switch scenario and send a reading right away so the app reacts quickly. */
  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
    this.log(`scenario: ${scenario}`);
    this.sending = scenario !== 'offline';
    switch (scenario) {
      case 'normal':
        this.helmetConnected = true;
        this.helmetWorn = true;
        this.crashTicks = 0;
        this.stopped = false;
        this.escapeDistance = null;
        break;
      case 'helmet-disconnect':
        this.helmetConnected = false;
        break;
      case 'helmet-reconnect':
        this.helmetConnected = true;
        this.helmetWorn = true;
        break;
      case 'helmet-not-worn':
        this.helmetConnected = true;
        this.helmetWorn = false;
        break;
      case 'crash':
        this.crashTicks = 3;
        this.stopped = true;
        break;
      case 'geofence-exit':
        this.stopped = false;
        this.escapeDistance = -1; // placed just inside the edge on the next tick
        break;
      case 'offline':
        this.log('telemetry paused: the server should report "scooter offline" after 30 s');
        return;
    }
    void this.syncZone().then(() => this.tick());
  }

  /** Ride inside the parent's safe zone if there is one; create one for the exit demo. */
  private async syncZone(): Promise<void> {
    if (this.options.minimal) return;
    try {
      const res = await fetch(this.options.baseUrl + routes.deviceState(this.options.deviceId));
      if (!res.ok) return;
      let geofence: Geofence | null = ((await res.json()) as DeviceState).geofence;
      if (!geofence && this.scenario === 'geofence-exit') {
        geofence = { ...this.center, radius_m: DEFAULT_ZONE_RADIUS_M };
        await fetch(this.options.baseUrl + routes.deviceGeofence(this.options.deviceId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geofence),
        });
        this.log(`no safe zone set: created one (${DEFAULT_ZONE_RADIUS_M} m)`);
      }
      if (geofence) {
        this.center = { latitude: geofence.latitude, longitude: geofence.longitude };
        this.zoneRadius = geofence.radius_m;
      }
    } catch {
      // server not reachable yet: tick() reports it
    }
  }

  private position(distance: number): { latitude: number; longitude: number } {
    const north = Math.cos(this.angle) * distance;
    const east = Math.sin(this.angle) * distance;
    return {
      latitude: this.center.latitude + north / METERS_PER_DEG_LAT,
      longitude:
        this.center.longitude +
        east / (METERS_PER_DEG_LAT * Math.cos((this.center.latitude * Math.PI) / 180)),
    };
  }

  private nextReading(): Telemetry {
    if (this.options.minimal) {
      return {
        helmet_connected: this.helmetConnected,
        helmet_worn: null,
        latitude: null,
        longitude: null,
        speed_kmh: null,
        battery_percent: null,
        crash_detected: false,
      };
    }

    const crashing = this.crashTicks > 0;
    if (crashing) this.crashTicks -= 1;
    const speed = this.stopped ? 0 : Math.round((14 + Math.random() * 6) * 10) / 10;
    const meters = (speed / 3.6) * (this.intervalMs / 1000);

    let distance: number;
    if (this.escapeDistance !== null) {
      // ride straight out of the zone
      this.escapeDistance =
        this.escapeDistance < 0 ? Math.max(this.zoneRadius - 10, 0) : this.escapeDistance + meters;
      distance = this.escapeDistance;
    } else {
      // loop around the center, well inside the zone
      distance = Math.min(LOOP_RADIUS_M, this.zoneRadius * 0.5);
      this.angle = (this.angle + meters / distance) % (2 * Math.PI);
    }

    this.battery = Math.max(5, this.battery - 0.05);
    return {
      helmet_connected: this.helmetConnected,
      helmet_worn: this.helmetConnected ? this.helmetWorn : null,
      ...this.position(distance),
      speed_kmh: speed,
      battery_percent: Math.round(this.battery),
      crash_detected: crashing,
    };
  }

  private async tick(): Promise<void> {
    if (!this.sending || this.busy || !this.timer) return;
    this.busy = true;
    const reading = this.nextReading();
    try {
      const res = await fetch(this.options.baseUrl + routes.telemetry(this.options.deviceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [DEVICE_KEY_HEADER]: this.options.apiKey },
        body: JSON.stringify(reading),
        signal: AbortSignal.timeout(10_000),
      });
      const summary =
        `helmet=${reading.helmet_connected ? 'on' : 'OFF'} worn=${reading.helmet_worn ?? 'n/a'} ` +
        `crash=${reading.crash_detected} speed=${reading.speed_kmh ?? 'n/a'} ` +
        `gps=${reading.latitude?.toFixed(5) ?? 'n/a'},${reading.longitude?.toFixed(5) ?? 'n/a'}`;
      this.log(res.ok ? `-> ${res.status} ${summary}` : `-> ${res.status} ${await res.text()}`);
    } catch (error) {
      this.log(`-> request failed: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
