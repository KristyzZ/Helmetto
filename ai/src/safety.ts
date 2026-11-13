import {
  ALERT_TYPES,
  OFFLINE_TIMEOUT_MS,
  RECOVERY_OF,
  type AlertType,
  type Geofence,
  type SafetyEventType,
  type Telemetry,
} from '@helmetto/shared';
import { checkProtection, DEFAULT_PROFILE, type EquipmentProfile, type ProtectionCheck } from './gear';
import { isPolygonZone, polygonAreaM2, zoneDepthMeters } from './geo';

/** Which alert conditions are active for one scooter. */
export type Conditions = Record<AlertType, boolean>;

export interface Evaluation {
  conditions: Conditions;
  /** Events to log: only what changed, in display order. Empty = nothing new. */
  events: SafetyEventType[];
}

export interface TelemetryEvaluation extends Evaluation {
  protection: ProtectionCheck;
}

export const NO_CONDITIONS: Readonly<Conditions> = Object.freeze({
  helmet_disconnected: false,
  helmet_not_worn: false,
  crash_detected: false,
  geofence_exit: false,
  scooter_offline: false,
  unprotected_use: false,
});

/** GPS jitter guard: once outside, the scooter must come this far back in to count as inside. */
export const GEOFENCE_HYSTERESIS_M = 10;

export function activeAlerts(conditions: Conditions): AlertType[] {
  return ALERT_TYPES.filter((type) => conditions[type]);
}

/** True when the scooter has been silent for longer than the timeout. Never-seen devices are not "offline". */
export function isOffline(
  lastSeenMs: number | null,
  nowMs: number,
  timeoutMs: number = OFFLINE_TIMEOUT_MS,
): boolean {
  if (lastSeenMs === null) return false;
  return nowMs - lastSeenMs > timeoutMs;
}

/** A known boolean decides the condition; null (sensor missing) keeps the previous one. */
function hold(previous: boolean, reading: boolean | null | undefined, activeWhen: boolean): boolean {
  if (reading === null || reading === undefined) return previous;
  return reading === activeWhen;
}

/** Narrow zones get a smaller margin so the scooter can still count as back inside. */
function hysteresisMargin(geofence: Geofence): number {
  const size = isPolygonZone(geofence)
    ? Math.sqrt(polygonAreaM2(geofence.points ?? [])) * 0.05
    : geofence.radius_m * 0.1;
  return Math.min(GEOFENCE_HYSTERESIS_M, size);
}

function geofenceExit(previous: boolean, telemetry: Telemetry, geofence: Geofence | null): boolean {
  if (!geofence) return false;
  const depth = zoneDepthMeters(geofence, { lat: telemetry.latitude, lon: telemetry.longitude });
  if (depth === null) return previous; // GPS null/invalid: ignore the check
  if (!previous) return depth < 0;
  return depth < hysteresisMargin(geofence);
}

/**
 * Conditions after a telemetry reading. Receiving telemetry means the device is
 * online. Missing gear only counts while the equipment is in use (or locked
 * because of it): that is the "No protection" alert. The original helmet
 * alerts are folded into it.
 */
export function nextConditions(
  previous: Conditions,
  telemetry: Telemetry,
  geofence: Geofence | null,
  profile: EquipmentProfile = DEFAULT_PROFILE,
): Conditions {
  return {
    helmet_disconnected: false,
    helmet_not_worn: false,
    unprotected_use: checkProtection(telemetry, profile).unprotected,
    crash_detected: hold(previous.crash_detected, telemetry.crash_detected, true),
    geofence_exit: geofenceExit(previous.geofence_exit, telemetry, geofence),
    scooter_offline: false,
  };
}

const TRANSITION_ORDER: readonly AlertType[] = [
  'scooter_offline',
  'crash_detected',
  'unprotected_use',
  'helmet_disconnected',
  'helmet_not_worn',
  'geofence_exit',
];

/**
 * Events for the differences between two condition sets: an alert when a
 * condition starts, its recovery when it ends, nothing while it is unchanged.
 */
export function detectTransitions(previous: Conditions, next: Conditions): SafetyEventType[] {
  const events: SafetyEventType[] = [];
  for (const type of TRANSITION_ORDER) {
    if (!previous[type] && next[type]) events.push(type);
    else if (previous[type] && !next[type]) events.push(RECOVERY_OF[type]);
  }
  return events;
}

/** Apply one telemetry reading. */
export function evaluateTelemetry(
  previous: Conditions,
  telemetry: Telemetry,
  geofence: Geofence | null,
  profile: EquipmentProfile = DEFAULT_PROFILE,
): TelemetryEvaluation {
  const conditions = nextConditions(previous, telemetry, geofence, profile);
  return { conditions, events: detectTransitions(previous, conditions), protection: checkProtection(telemetry, profile) };
}

/** The required gear or auto-lock setting changed: re-check the last live reading. */
export function evaluateProfileChange(
  previous: Conditions,
  lastTelemetry: Telemetry | null,
  profile: EquipmentProfile,
): Evaluation {
  if (!lastTelemetry) return { conditions: { ...previous, unprotected_use: false }, events: [] };
  const conditions = { ...previous, unprotected_use: checkProtection(lastTelemetry, profile).unprotected };
  return { conditions, events: detectTransitions(previous, conditions) };
}

/** Periodic check with no new telemetry: only the offline condition can start here. */
export function evaluateHeartbeat(
  previous: Conditions,
  lastSeenMs: number | null,
  nowMs: number,
  timeoutMs: number = OFFLINE_TIMEOUT_MS,
): Evaluation {
  if (previous.scooter_offline || !isOffline(lastSeenMs, nowMs, timeoutMs)) {
    return { conditions: previous, events: [] };
  }
  const conditions = { ...previous, scooter_offline: true };
  return { conditions, events: detectTransitions(previous, conditions) };
}

/**
 * The parent changed or removed the geofence: re-check the last reading against it.
 * Removing the zone clears the condition silently (the scooter did not come back).
 */
export function evaluateGeofenceChange(
  previous: Conditions,
  lastTelemetry: Telemetry | null,
  geofence: Geofence | null,
): Evaluation {
  if (!geofence || !lastTelemetry) {
    return { conditions: { ...previous, geofence_exit: false }, events: [] };
  }
  // A new zone is judged fresh, without hysteresis from the old one.
  const exit = geofenceExit(false, lastTelemetry, geofence);
  const conditions = { ...previous, geofence_exit: exit };
  return { conditions, events: detectTransitions(previous, conditions) };
}
