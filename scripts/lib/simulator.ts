import { zoneDepthMeters } from '@helmetto/ai';
import {
  DEVICE_KEY_HEADER,
  EQUIPMENT_INFO,
  TELEMETRY_INTERVAL_MS,
  routes,
  type DemoScenario,
  type DeviceState,
  type EquipmentKind,
  type GearReading,
  type GearType,
  type Geofence,
  type Telemetry,
  type TelemetryAccepted,
} from '@helmetto/shared';

export interface SimulatorOptions {
  /** e.g. http://localhost:3000 or the deployed https URL. */
  baseUrl: string;
  deviceId: string;
  apiKey: string;
  intervalMs?: number;
  /** Where the mock equipment is when it has no work area. */
  home?: { latitude: number; longitude: number };
  /**
   * Send only what today's ESP8266 hardware sends: helmet_connected (one gear
   * tag) and crash_detected, everything else null.
   */
  minimal?: boolean;
  log?: (line: string) => void;
}

/** Vilnius old town. Mock coordinates until the hardware has GPS. */
export const DEFAULT_HOME = { latitude: 54.6872, longitude: 25.2797 };
const DEFAULT_ZONE_RADIUS_M = 250;
const METERS_PER_DEG_LAT = 111_320;

/** How each kind of equipment behaves in the simulation. */
const BEHAVIOUR: Record<
  EquipmentKind,
  {
    gps: boolean;
    /** km/h while in use; null = the device doesn't report speed. */
    speed: [number, number] | null;
    /** Radius of the loop it moves on, in meters. */
    loop: number;
    /** The gear that goes wrong in "gear-removed", and how. */
    removes: 'missing' | 'not_worn';
  }
> = {
  power_tool: { gps: false, speed: null, loop: 0, removes: 'missing' },
  chainsaw: { gps: true, speed: null, loop: 25, removes: 'missing' },
  boat: { gps: true, speed: [12, 22], loop: 220, removes: 'not_worn' },
  scooter: { gps: true, speed: [14, 20], loop: 120, removes: 'missing' },
  other: { gps: true, speed: null, loop: 30, removes: 'missing' },
};

/** Which required item comes off in "gear-removed": the most telling one per kind. */
const REMOVED: Partial<Record<EquipmentKind, GearType>> = {
  power_tool: 'eye_protection',
  chainsaw: 'chaps',
  boat: 'life_jacket',
};

/**
 * A fake piece of equipment. It sends real HTTP telemetry to the real endpoint
 * with the real device key, so mock data takes exactly the same path as
 * hardware. Kind and required gear are read from the server.
 */
export class Simulator {
  scenario: DemoScenario = 'normal';

  private readonly intervalMs: number;
  private readonly log: (line: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  // device profile, from the server
  private kind: EquipmentKind = 'other';
  private requiredGear: GearType[] = ['helmet'];

  // state
  private center: { latitude: number; longitude: number };
  private zone: Geofence | null = null;
  private loopRadius = 30;
  private angle = 0;
  private escapeDistance: number | null = null;
  private active = true;
  /** Gear that is off, and how. */
  private off = new Map<GearType, 'missing' | 'not_worn'>();
  private locked = false;
  private crashTicks = 0;
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

  private removedGear(): GearType {
    const preferred = REMOVED[this.kind];
    return preferred && this.requiredGear.includes(preferred) ? preferred : (this.requiredGear[0] ?? 'helmet');
  }

  /** Switch scenario and send a reading right away so the app reacts quickly. */
  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
    this.log(`scenario: ${scenario}`);
    this.sending = scenario !== 'offline';
    if (scenario === 'offline') {
      this.log('telemetry paused: the server should report "offline" after 30 s');
      return;
    }
    void this.syncDevice().then(() => {
      switch (scenario) {
        case 'normal':
          this.active = true;
          this.off.clear();
          this.crashTicks = 0;
          this.escapeDistance = null;
          break;
        case 'gear-removed':
        case 'helmet-disconnect':
          this.active = true;
          this.off.set(this.removedGear(), BEHAVIOUR[this.kind].removes);
          break;
        case 'helmet-not-worn':
          this.active = true;
          this.off.set(this.removedGear(), 'not_worn');
          break;
        case 'gear-back':
        case 'helmet-reconnect':
          this.off.clear();
          this.active = true;
          break;
        case 'idle':
          this.active = false;
          this.off.set(this.removedGear(), 'missing');
          this.escapeDistance = null;
          break;
        case 'crash':
          this.crashTicks = 3;
          this.active = false;
          break;
        case 'geofence-exit':
          this.active = true;
          this.escapeDistance = -1; // placed just inside the edge on the next tick
          break;
      }
      return this.tick();
    });
  }

  /** Read the device's kind, gear and work area; create a work area for the exit demo. */
  private async syncDevice(): Promise<void> {
    try {
      const res = await fetch(this.options.baseUrl + routes.deviceState(this.options.deviceId));
      if (!res.ok) return;
      const state = (await res.json()) as DeviceState;
      this.kind = state.kind ?? 'other';
      this.requiredGear = state.required_gear ?? [...EQUIPMENT_INFO[this.kind].defaultGear];
      if (this.options.minimal || !BEHAVIOUR[this.kind].gps) return;
      let geofence: Geofence | null = state.geofence;
      if (!geofence && this.scenario === 'geofence-exit') {
        geofence = { ...this.center, radius_m: DEFAULT_ZONE_RADIUS_M };
        await fetch(this.options.baseUrl + routes.deviceGeofence(this.options.deviceId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geofence),
        });
        this.log(`no work area set: created one (${DEFAULT_ZONE_RADIUS_M} m)`);
      }
      this.useZone(geofence);
    } catch {
      // server not reachable yet: tick() reports it
    }
  }

  /** Pick a centre and loop size that fit the zone, whatever its shape. */
  private useZone(geofence: Geofence | null): void {
    this.zone = geofence;
    const wanted = BEHAVIOUR[this.kind].loop;
    if (!geofence) {
      this.loopRadius = wanted;
      return;
    }
    // The point deepest inside the zone, searched on a grid over its enclosing circle.
    let best = { latitude: geofence.latitude, longitude: geofence.longitude };
    let bestDepth = zoneDepthMeters(geofence, { lat: best.latitude, lon: best.longitude }) ?? 0;
    if (geofence.shape === 'polygon') {
      const STEPS = 24;
      const span = geofence.radius_m / METERS_PER_DEG_LAT;
      const lonScale = Math.cos((geofence.latitude * Math.PI) / 180);
      for (let i = 0; i <= STEPS; i++) {
        for (let j = 0; j <= STEPS; j++) {
          const latitude = geofence.latitude + span * ((2 * i) / STEPS - 1);
          const longitude = geofence.longitude + (span / lonScale) * ((2 * j) / STEPS - 1);
          const depth = zoneDepthMeters(geofence, { lat: latitude, lon: longitude }) ?? -Infinity;
          if (depth > bestDepth) {
            bestDepth = depth;
            best = { latitude, longitude };
          }
        }
      }
    }
    this.center = best;
    this.loopRadius = Math.max(2, Math.min(wanted, bestDepth * 0.5));
  }

  /** Distance from the centre to the zone edge in the current direction. */
  private distanceToEdge(): number {
    if (!this.zone) return DEFAULT_ZONE_RADIUS_M;
    const limit = this.zone.radius_m * 2 + 50;
    for (let distance = 0; distance <= limit; distance += 2) {
      const p = this.position(distance);
      if ((zoneDepthMeters(this.zone, { lat: p.latitude, lon: p.longitude }) ?? -1) < 0) return distance;
    }
    return limit;
  }

  private position(distance: number): { latitude: number; longitude: number } {
    const north = Math.cos(this.angle) * distance;
    const east = Math.sin(this.angle) * distance;
    return {
      latitude: this.center.latitude + north / METERS_PER_DEG_LAT,
      longitude:
        this.center.longitude + east / (METERS_PER_DEG_LAT * Math.cos((this.center.latitude * Math.PI) / 180)),
    };
  }

  private gear(): GearReading[] {
    return this.requiredGear.map((type) => {
      const off = this.off.get(type);
      return { type, connected: off !== 'missing', worn: off === undefined ? true : off === 'not_worn' ? false : null };
    });
  }

  private nextReading(): Telemetry {
    const running = this.active && !this.locked;
    const gear = this.gear();
    const allConnected = gear.every((g) => g.connected);
    const crashing = this.crashTicks > 0;
    if (crashing) this.crashTicks -= 1;

    if (this.options.minimal) {
      // today's hardware: one tag, no motion or lock sensing
      return {
        helmet_connected: allConnected,
        helmet_worn: null,
        latitude: null,
        longitude: null,
        speed_kmh: null,
        battery_percent: null,
        crash_detected: crashing,
      };
    }

    const behaviour = BEHAVIOUR[this.kind];
    const [low, high] = behaviour.speed ?? [2, 4]; // on foot when the device has no speed sensor
    const speed = running && this.kind !== 'power_tool' ? low + Math.random() * (high - low) : 0;
    const meters = (speed / 3.6) * (this.intervalMs / 1000);

    let location: { latitude: number; longitude: number } | null = null;
    if (behaviour.gps) {
      let distance: number;
      if (this.escapeDistance !== null) {
        this.escapeDistance =
          this.escapeDistance < 0 ? Math.max(this.distanceToEdge() - 10, 0) : this.escapeDistance + Math.max(meters, 15);
        distance = this.escapeDistance;
      } else {
        distance = this.loopRadius;
        if (distance > 0) this.angle = (this.angle + meters / distance) % (2 * Math.PI);
      }
      location = this.position(distance);
    }

    this.battery = Math.max(5, this.battery - (running ? 0.08 : 0.01));
    return {
      helmet_connected: allConnected,
      helmet_worn: null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      speed_kmh: behaviour.speed ? Math.round(speed * 10) / 10 : null,
      battery_percent: Math.round(this.battery),
      crash_detected: crashing,
      equipment_active: running,
      gear,
      locked: this.locked,
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
      if (!res.ok) {
        this.log(`-> ${res.status} ${await res.text()}`);
        return;
      }
      // Obey the server's lock, like real lock hardware would.
      const lock = ((await res.json()) as TelemetryAccepted).lock === true;
      if (lock !== this.locked) this.log(lock ? 'server says LOCK: equipment locked' : 'server says unlock');
      this.locked = lock;
      const gear = reading.gear?.map((g) => `${g.type}=${g.connected ? (g.worn === false ? 'off' : 'on') : 'GONE'}`).join(' ');
      this.log(
        `-> ${res.status} ${reading.equipment_active === false ? 'idle' : 'in use'} ${gear ?? `tag=${reading.helmet_connected ? 'on' : 'GONE'}`}` +
          (reading.latitude != null ? ` gps=${reading.latitude.toFixed(5)},${reading.longitude!.toFixed(5)}` : ''),
      );
    } catch (error) {
      this.log(`-> request failed: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
