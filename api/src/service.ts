import { EventEmitter } from 'node:events';
import {
  activeAlerts,
  checkGeofence,
  evaluateGeofenceChange,
  evaluateHeartbeat,
  evaluateTelemetry,
  isValidCoordinate,
  placeAt,
  type Evaluation,
} from '@helmetto/ai';
import {
  EVENT_INFO,
  PLACES_MAX,
  type DeviceState,
  type DeviceUpdate,
  type Geofence,
  type Place,
  type PlaceInput,
  type SafetyEvent,
  type SafetyEventType,
  type Telemetry,
} from '@helmetto/shared';
import type { DeviceRow, Store } from './db';

/** One short line per event. `who` is the child's name, or the scooter's when no child name is set. */
const MESSAGES: Record<Exclude<SafetyEventType, 'place_arrived'>, (who: string) => string> = {
  helmet_disconnected: (w) => `${w}'s helmet is out of range or switched off.`,
  helmet_reconnected: (w) => `${w}'s helmet is connected again.`,
  helmet_not_worn: (w) => `${w}'s helmet is nearby but not being worn.`,
  helmet_worn: (w) => `${w}'s helmet is back on.`,
  crash_detected: (w) => `${w}'s scooter reported a crash.`,
  crash_cleared: (w) => `${w}'s scooter no longer reports a crash.`,
  geofence_exit: (w) => `${w} left the safe zone.`,
  geofence_enter: (w) => `${w} is back in the safe zone.`,
  scooter_offline: (w) => `${w}'s scooter stopped sending data.`,
  scooter_online: (w) => `${w}'s scooter is sending data again.`,
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
      child_name: device.childName,
      child_phone: device.childPhone,
      online: device.lastSeenAt !== null && !device.conditions.scooter_offline,
      last_seen_at: device.lastSeenAt === null ? null : new Date(device.lastSeenAt).toISOString(),
      telemetry: t,
      last_location: device.lastLocation
        ? { ...device.lastLocation, at: new Date(device.lastLocation.at).toISOString() }
        : null,
      active_alerts: activeAlerts(device.conditions),
      geofence: device.geofence,
      zone_status: checkGeofence(device.geofence, t?.latitude, t?.longitude),
      places: this.store.listPlaces(device.id),
      at_place_id: device.atPlaceId,
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

  /** Persist the evaluation, log its events (and an arrival, if any), then notify listeners. */
  private commit(device: DeviceRow, evaluation: Evaluation, at: number, arrivedAt: Place | null = null): SafetyEvent[] {
    device.conditions = evaluation.conditions;
    const who = device.childName ?? device.name;
    const where = {
      device_id: device.id,
      created_at: at,
      latitude: device.lastLocation?.latitude ?? null,
      longitude: device.lastLocation?.longitude ?? null,
    };
    const events = this.store.transaction(() => {
      this.store.saveDevice(device);
      const logged = evaluation.events.map((type) =>
        this.store.addEvent({
          ...where,
          type: type as Exclude<SafetyEventType, 'place_arrived'>,
          severity: EVENT_INFO[type].severity,
          message: MESSAGES[type as Exclude<SafetyEventType, 'place_arrived'>](who),
        }),
      );
      if (arrivedAt) {
        logged.push(
          this.store.addEvent({
            ...where,
            type: 'place_arrived',
            severity: EVENT_INFO.place_arrived.severity,
            message: `${who} arrived at ${arrivedAt.name}.`,
            place_name: arrivedAt.name,
          }),
        );
      }
      return logged;
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

    // Arrival: GPS puts the scooter at a marked place it wasn't at before. The
    // very first position ever is only a starting point, not an arrival.
    let arrivedAt: Place | null = null;
    if (hasGps) {
      const places = this.store.listPlaces(device.id);
      const next = placeAt(places, telemetry.latitude, telemetry.longitude, device.atPlaceId);
      if (next !== null && next !== device.atPlaceId && device.lastLocation) {
        arrivedAt = places.find((p) => p.id === next) ?? null;
      }
      device.atPlaceId = next;
    }

    device.telemetry = telemetry;
    device.lastSeenAt = at;
    if (hasGps) device.lastLocation = { latitude: telemetry.latitude!, longitude: telemetry.longitude!, at };
    return this.commit(device, evaluation, at, arrivedAt);
  }

  /**
   * Mark a place. If the scooter is already there, that's where it is, quietly:
   * arriving needs riding in.
   */
  addPlace(deviceId: string, input: PlaceInput): DeviceState | 'not_found' | 'too_many' {
    const device = this.store.getDevice(deviceId);
    if (!device) return 'not_found';
    if (this.store.listPlaces(deviceId).length >= PLACES_MAX) return 'too_many';
    this.store.addPlace(deviceId, input, this.now());
    this.relocate(device);
    return this.publish(device);
  }

  deletePlace(deviceId: string, placeId: number): DeviceState | 'not_found' {
    const device = this.store.getDevice(deviceId);
    if (!device || !this.store.deletePlace(deviceId, placeId)) return 'not_found';
    this.relocate(device);
    return this.publish(device);
  }

  /** Which place the last known position is at, after the places changed. */
  private relocate(device: DeviceRow): void {
    const p = device.lastLocation;
    device.atPlaceId = p ? placeAt(this.store.listPlaces(device.id), p.latitude, p.longitude, device.atPlaceId) : null;
    this.store.saveDevice(device);
  }

  private publish(device: DeviceRow): DeviceState {
    const state = this.toState(device);
    this.emit('state', state);
    return state;
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

  /** Rename the scooter, or set the child's name or phone number. */
  updateDevice(deviceId: string, update: DeviceUpdate): DeviceState | null {
    const device = this.store.getDevice(deviceId);
    if (!device) return null;
    if (update.name !== undefined) device.name = update.name;
    if (update.child_name !== undefined) device.childName = update.child_name;
    if (update.child_phone !== undefined) device.childPhone = update.child_phone;
    this.store.saveDevice(device);
    const state = this.toState(device);
    this.emit('state', state);
    return state;
  }

  /**
   * A parent pressed "I'm on it". Only alerts can be acknowledged; the first
   * acknowledgement wins. Every open app gets the updated event.
   */
  acknowledge(eventId: number, by: string | null): SafetyEvent | 'not_found' | 'not_an_alert' {
    const event = this.store.getEvent(eventId);
    if (!event) return 'not_found';
    if (event.severity !== 'alert') return 'not_an_alert';
    if (event.acknowledged_at) return event;
    const updated = this.store.acknowledgeEvent(eventId, by, this.now())!;
    this.emit('alert_update', updated);
    return updated;
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
