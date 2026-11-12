import { EventEmitter } from 'node:events';
import {
  activeAlerts,
  checkGeofence,
  evaluateGeofenceChange,
  evaluateHeartbeat,
  evaluateTelemetry,
  isValidCoordinate,
  type Evaluation,
} from '@helmetto/ai';
import {
  EVENT_INFO,
  type DeviceState,
  type Geofence,
  type SafetyEvent,
  type SafetyEventType,
  type Telemetry,
} from '@helmetto/shared';
import type { DeviceRow, Store } from './db';

const MESSAGES: Record<SafetyEventType, (name: string) => string> = {
  helmet_disconnected: (n) => `${n}: the helmet is out of range or switched off while the scooter is on.`,
  helmet_reconnected: (n) => `${n}: the helmet is connected again.`,
  helmet_not_worn: (n) => `${n}: the helmet is nearby but not being worn.`,
  helmet_worn: (n) => `${n}: the helmet is being worn again.`,
  crash_detected: (n) => `${n}: the scooter reported a crash. Check on the rider now.`,
  crash_cleared: (n) => `${n}: the scooter no longer reports a crash.`,
  geofence_exit: (n) => `${n} left the safe zone.`,
  geofence_enter: (n) => `${n} is back inside the safe zone.`,
  scooter_offline: (n) => `${n} stopped sending data. Helmet and location status are unknown until it reconnects.`,
  scooter_online: (n) => `${n} is sending data again.`,
};

/**
 * Applies the ai/ safety rules to stored state and announces what changed.
 * Emits 'state' (DeviceState) and 'alert' (SafetyEvent) for the SSE stream.
 */
export class SafetyService extends EventEmitter {
  constructor(
    private store: Store,
    private options: { offlineTimeoutMs: number; now?: () => number },
  ) {
    super();
    this.setMaxListeners(0);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  toState(device: DeviceRow): DeviceState {
    const t = device.telemetry;
    return {
      device_id: device.id,
      name: device.name,
      online: device.lastSeenAt !== null && !device.conditions.scooter_offline,
      last_seen_at: device.lastSeenAt === null ? null : new Date(device.lastSeenAt).toISOString(),
      telemetry: t,
      last_location: device.lastLocation
        ? { ...device.lastLocation, at: new Date(device.lastLocation.at).toISOString() }
        : null,
      active_alerts: activeAlerts(device.conditions),
      geofence: device.geofence,
      zone_status: checkGeofence(device.geofence, t?.latitude, t?.longitude),
      server_time: new Date(this.now()).toISOString(),
    };
  }

  listStates(): DeviceState[] {
    return this.store.listDevices().map((d) => this.toState(d));
  }

  getState(deviceId: string): DeviceState | null {
    const device = this.store.getDevice(deviceId);
    return device ? this.toState(device) : null;
  }

  /** Persist the evaluation, log its events, then notify listeners. */
  private commit(device: DeviceRow, evaluation: Evaluation, at: number): SafetyEvent[] {
    device.conditions = evaluation.conditions;
    const events = this.store.transaction(() => {
      this.store.saveDevice(device);
      return evaluation.events.map((type) =>
        this.store.addEvent({
          device_id: device.id,
          type,
          severity: EVENT_INFO[type].severity,
          message: MESSAGES[type](device.name),
          created_at: at,
          latitude: device.lastLocation?.latitude ?? null,
          longitude: device.lastLocation?.longitude ?? null,
        }),
      );
    });
    this.emit('state', this.toState(device));
    for (const event of events) this.emit('alert', event);
    return events;
  }

  ingestTelemetry(deviceId: string, input: Telemetry): SafetyEvent[] {
    const device = this.store.getDevice(deviceId);
    if (!device) throw new Error(`Unknown device ${deviceId}`);
    const at = this.now();

    // An unusable GPS pair is stored as "no location", never as a real reading.
    const hasGps = isValidCoordinate(input.latitude, input.longitude);
    const telemetry: Telemetry = hasGps ? input : { ...input, latitude: null, longitude: null };

    const evaluation = evaluateTelemetry(device.conditions, telemetry, device.geofence);
    device.telemetry = telemetry;
    device.lastSeenAt = at;
    if (hasGps) device.lastLocation = { latitude: telemetry.latitude!, longitude: telemetry.longitude!, at };
    return this.commit(device, evaluation, at);
  }

  setGeofence(deviceId: string, geofence: Geofence | null): DeviceState | null {
    const device = this.store.getDevice(deviceId);
    if (!device) return null;
    // Judge the new zone only against a live reading, not a stale one.
    const live = device.conditions.scooter_offline ? null : device.telemetry;
    const evaluation = live
      ? evaluateGeofenceChange(device.conditions, live, geofence)
      : { conditions: { ...device.conditions, geofence_exit: false }, events: [] };
    device.geofence = geofence;
    this.commit(device, evaluation, this.now());
    return this.toState(device);
  }

  /** Mark scooters that went silent as offline. Called on a timer. */
  sweepOffline(): void {
    const now = this.now();
    for (const device of this.store.listDevices()) {
      const evaluation = evaluateHeartbeat(
        device.conditions,
        device.lastSeenAt,
        now,
        this.options.offlineTimeoutMs,
      );
      if (evaluation.events.length > 0) this.commit(device, evaluation, now);
    }
  }
}
