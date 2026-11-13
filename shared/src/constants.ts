import type {
  AlertType,
  EquipmentKind,
  GearType,
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
/** Worker tag IDs: letters, digits, - and _. Stored upper-case. */
export const WORKER_TAG_PATTERN = /^[A-Z0-9_-]{1,32}$/;

export const ALERT_TYPES: readonly AlertType[] = [
  'crash_detected',
  'unprotected_use',
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
  unprotected_use: 'protection_restored',
};

export const EVENT_INFO: Record<SafetyEventType, { severity: Severity; title: string }> = {
  unprotected_use: { severity: 'alert', title: 'No protection' },
  protection_restored: { severity: 'recovery', title: 'Safe again' },
  helmet_disconnected: { severity: 'alert', title: 'Helmet disconnected' },
  helmet_not_worn: { severity: 'alert', title: 'Helmet not worn' },
  crash_detected: { severity: 'alert', title: 'Impact detected' },
  geofence_exit: { severity: 'alert', title: 'Left the work area' },
  scooter_offline: { severity: 'alert', title: 'Offline' },
  helmet_reconnected: { severity: 'recovery', title: 'Helmet reconnected' },
  helmet_worn: { severity: 'recovery', title: 'Helmet back on' },
  crash_cleared: { severity: 'recovery', title: 'Impact cleared' },
  geofence_enter: { severity: 'recovery', title: 'Back in the work area' },
  scooter_online: { severity: 'recovery', title: 'Back online' },
};

export const GEAR_INFO: Record<GearType, { label: string; short: string }> = {
  helmet: { label: 'Helmet', short: 'helmet' },
  eye_protection: { label: 'Safety glasses', short: 'safety glasses' },
  ear_protection: { label: 'Ear defenders', short: 'ear defenders' },
  gloves: { label: 'Gloves', short: 'gloves' },
  chaps: { label: 'Chainsaw chaps', short: 'chaps' },
  life_jacket: { label: 'Life jacket', short: 'life jacket' },
};

export const GEAR_TYPES = Object.keys(GEAR_INFO) as GearType[];

export const EQUIPMENT_INFO: Record<
  EquipmentKind,
  { label: string; inUse: string; idle: string; defaultGear: GearType[] }
> = {
  power_tool: { label: 'Power tool', inUse: 'Running', idle: 'Off', defaultGear: ['eye_protection', 'ear_protection', 'gloves'] },
  chainsaw: { label: 'Chainsaw', inUse: 'Running', idle: 'Off', defaultGear: ['helmet', 'chaps', 'ear_protection'] },
  boat: { label: 'Boat', inUse: 'Under way', idle: 'Moored', defaultGear: ['life_jacket'] },
  scooter: { label: 'Scooter', inUse: 'Riding', idle: 'Parked', defaultGear: ['helmet'] },
  other: { label: 'Equipment', inUse: 'In use', idle: 'Not in use', defaultGear: ['helmet'] },
};

export const EQUIPMENT_KINDS = Object.keys(EQUIPMENT_INFO) as EquipmentKind[];

/** Scenarios shown in the demo panel and the simulator. */
export const DEMO_SCENARIOS: readonly { id: DemoScenario; label: string; description: string }[] = [
  { id: 'normal', label: 'In use, protected', description: 'Equipment in use, all gear on' },
  { id: 'gear-removed', label: 'Gear taken off', description: 'A required piece of gear goes missing while in use' },
  { id: 'gear-back', label: 'Gear back on', description: 'All required gear is back' },
  { id: 'idle', label: 'Switched off', description: 'Equipment off, gear put away: no alert' },
  { id: 'switch-worker', label: 'Other worker', description: 'Another worker takes over the equipment' },
  { id: 'crash', label: 'Impact', description: 'Accelerometer reports a hard impact' },
  { id: 'geofence-exit', label: 'Leaves work area', description: 'Moves straight out of the work area' },
  { id: 'offline', label: 'Goes offline', description: 'Telemetry stops; offline after 30 s' },
];

/** Every scenario id the API accepts, including the original scooter ones. */
export const ALL_DEMO_SCENARIOS: readonly DemoScenario[] = [
  'normal', 'gear-removed', 'gear-back', 'idle', 'switch-worker', 'crash', 'geofence-exit', 'offline',
  'helmet-disconnect', 'helmet-reconnect', 'helmet-not-worn',
];
