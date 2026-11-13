import { EventEmitter } from 'node:events';
import {
  activeAlerts,
  checkGeofence,
  checkProtection,
  evaluateGeofenceChange,
  evaluateHeartbeat,
  evaluateProfileChange,
  evaluateTelemetry,
  isValidCoordinate,
  type EquipmentProfile,
  type Evaluation,
} from '@helmetto/ai';
import {
  EQUIPMENT_INFO,
  EVENT_INFO,
  GEAR_INFO,
  type DeviceState,
  type DeviceUpdate,
  type GearType,
  type Geofence,
  type SafetyEvent,
  type SafetyEventType,
  type Telemetry,
} from '@helmetto/shared';
import type { DeviceRow, Store } from './db';

export const profileOf = (device: DeviceRow): EquipmentProfile => ({
  requiredGear: device.requiredGear,
  autoLock: device.autoLock,
});

/** "chaps", "chaps and gloves", "chaps, gloves and ear defenders" */
function gearList(types: readonly GearType[]): string {
  const names = types.map((t) => GEAR_INFO[t].short);
  if (names.length <= 1) return names[0] ?? 'protective gear';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One short sentence per event, e.g. "Mantas is using Chainsaw 2 without chaps." */
function message(type: SafetyEventType, device: DeviceRow): string {
  const who = device.childName;
  const name = device.name;
  const kind = EQUIPMENT_INFO[device.kind];
  const t = device.telemetry;
  const check = t ? checkProtection(t, profileOf(device)) : null;
  const subject = who ? `${who} (${name})` : name;
  switch (type) {
    case 'unprotected_use': {
      const missing = gearList(check?.unsafe ?? []);
      const locked = check?.lock ? ' Locked until it is back.' : '';
      if (device.kind === 'boat') return `${subject}: under way without ${missing} on.${locked}`;
      return `${subject}: ${kind.inUse.toLowerCase()} without ${missing}.${locked}`;
    }
    case 'protection_restored':
      return check && check.unsafe.length > 0
        ? `${name} is ${kind.idle.toLowerCase()}.`
        : `${subject}: all required gear is back on.`;
    case 'crash_detected':
      return `${name} reported a hard impact. Check on ${who ?? 'the operator'} now.`;
    case 'crash_cleared':
      return `${name} no longer reports an impact.`;
    case 'geofence_exit':
      return `${name} left the work area.`;
    case 'geofence_enter':
      return `${name} is back in the work area.`;
    case 'scooter_offline':
      return `${name} stopped sending data.`;
    case 'scooter_online':
      return `${name} is sending data again.`;
    case 'helmet_disconnected':
      return `${subject}: helmet out of range.`;
    case 'helmet_reconnected':
      return `${subject}: helmet connected again.`;
    case 'helmet_not_worn':
      return `${subject}: helmet not worn.`;
    case 'helmet_worn':
      return `${subject}: helmet back on.`;
  }
}

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
    const online = device.lastSeenAt !== null && !device.conditions.scooter_offline;
    const check = t && online ? checkProtection(t, profileOf(device)) : null;
    return {
      device_id: device.id,
      name: device.name,
      child_name: device.childName,
      operator_name: device.childName,
      kind: device.kind,
      site: device.site,
      required_gear: device.requiredGear,
      gear_status: check?.gear ?? device.requiredGear.map((type) => ({ type, state: 'unknown' as const })),
      in_use: check ? check.inUse : null,
      auto_lock: device.autoLock,
      lock_engaged: check?.lock ?? false,
      online,
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
          message: message(type, device),
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

  /** Store a reading and apply the rules. `lock` is what the equipment should do next. */
  ingestTelemetry(deviceId: string, input: Telemetry): { events: SafetyEvent[]; lock: boolean } {
    const device = this.store.getDevice(deviceId);
    if (!device) throw new Error(`Unknown device ${deviceId}`);
    const at = this.now();

    // An unusable GPS pair is stored as "no location", never as a real reading.
    const hasGps = isValidCoordinate(input.latitude, input.longitude);
    const telemetry: Telemetry = hasGps ? input : { ...input, latitude: null, longitude: null };

    const evaluation = evaluateTelemetry(device.conditions, telemetry, device.geofence, profileOf(device));
    device.telemetry = telemetry;
    device.lastSeenAt = at;
    if (hasGps) device.lastLocation = { latitude: telemetry.latitude!, longitude: telemetry.longitude!, at };
    return { events: this.commit(device, evaluation, at), lock: evaluation.protection.lock };
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

  /** Rename, set the operator and site, or change what gear is required. */
  updateDevice(deviceId: string, update: DeviceUpdate): DeviceState | null {
    const device = this.store.getDevice(deviceId);
    if (!device) return null;
    if (update.name !== undefined) device.name = update.name;
    if (update.child_name !== undefined) device.childName = update.child_name;
    if (update.operator_name !== undefined) device.childName = update.operator_name;
    if (update.site !== undefined) device.site = update.site;
    if (update.kind !== undefined) device.kind = update.kind;
    if (update.required_gear !== undefined) device.requiredGear = [...new Set(update.required_gear)];
    if (update.auto_lock !== undefined) device.autoLock = update.auto_lock;

    // A new gear list or lock setting can start or end an alert right away.
    const live = device.conditions.scooter_offline ? null : device.telemetry;
    this.commit(device, evaluateProfileChange(device.conditions, live, profileOf(device)), this.now());
    return this.toState(device);
  }

  /** Mark devices that went silent as offline. Called on a timer. */
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
