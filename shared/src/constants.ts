import type {
  AlertType,
  DemoScenario,
  RecoveryType,
  SafetyEventType,
  Severity,
} from './types';

/** Scooter is expected to send telemetry about this often. */
export const TELEMETRY_INTERVAL_MS = 5_000;
/** No telemetry for this long => scooter is offline. */
export const OFFLINE_TIMEOUT_MS = 30_000;
/** Scooter-side: no helmet heartbeat for this long => helmet_connected false. */
export const HELMET_TIMEOUT_MS = 15_000;

export const GEOFENCE_MIN_RADIUS_M = 50;
export const GEOFENCE_MAX_RADIUS_M = 5_000;
/** Drawn (polygon) zones. */
export const GEOFENCE_MIN_POINTS = 3;
export const GEOFENCE_MAX_POINTS = 50;
/** Smallest drawn zone the server accepts (about 20 m x 20 m). */
export const GEOFENCE_MIN_AREA_M2 = 400;
export const NAME_MAX_LENGTH = 40;

export const ALERT_TYPES: readonly AlertType[] = [
  'crash_detected',
  'helmet_disconnected',
  'helmet_not_worn',
  'geofence_exit',
  'scooter_offline',
];

/** The event logged when each alert condition ends. */
export const RECOVERY_OF: Record<AlertType, RecoveryType> = {
  helmet_disconnected: 'helmet_reconnected',
  helmet_not_worn: 'helmet_worn',
  crash_detected: 'crash_cleared',
  geofence_exit: 'geofence_enter',
  scooter_offline: 'scooter_online',
};

export const EVENT_INFO: Record<SafetyEventType, { severity: Severity; title: string }> = {
  helmet_disconnected: { severity: 'alert', title: 'Helmet disconnected' },
  helmet_not_worn: { severity: 'alert', title: 'Helmet not worn' },
  crash_detected: { severity: 'alert', title: 'Crash detected' },
  geofence_exit: { severity: 'alert', title: 'Left the safe zone' },
  scooter_offline: { severity: 'alert', title: 'Scooter offline' },
  helmet_reconnected: { severity: 'recovery', title: 'Helmet reconnected' },
  helmet_worn: { severity: 'recovery', title: 'Helmet back on' },
  crash_cleared: { severity: 'recovery', title: 'Crash alert cleared' },
  geofence_enter: { severity: 'recovery', title: 'Back in the safe zone' },
  scooter_online: { severity: 'recovery', title: 'Scooter back online' },
};

export const DEMO_SCENARIOS: readonly { id: DemoScenario; label: string; description: string }[] = [
  { id: 'normal', label: 'Normal ride', description: 'Helmet on, riding a loop inside the safe zone' },
  { id: 'helmet-disconnect', label: 'Helmet disconnects', description: 'Scooter loses the helmet heartbeat' },
  { id: 'helmet-reconnect', label: 'Helmet reconnects', description: 'Helmet heartbeat is back' },
  { id: 'helmet-not-worn', label: 'Helmet not worn', description: 'Helmet in range but not on the head' },
  { id: 'crash', label: 'Crash detected', description: 'Accelerometer reports a crash, scooter stops' },
  { id: 'geofence-exit', label: 'Leaves safe zone', description: 'Rides straight out of the safe zone' },
  { id: 'offline', label: 'Scooter goes offline', description: 'Telemetry stops; offline after 30 s' },
];
