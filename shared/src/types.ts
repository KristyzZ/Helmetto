/**
 * Helmetto shared contract. Imported by web/, api/, ai/ and scripts/.
 * RULE: additive changes only. Add optional fields; never rename or remove.
 * The wire format is snake_case everywhere.
 */

/** What a device is attached to. Missing = 'other'. */
export type EquipmentKind = 'power_tool' | 'chainsaw' | 'boat' | 'scooter' | 'other';

/** Protective gear that can carry a tag. */
export type GearType = 'helmet' | 'eye_protection' | 'ear_protection' | 'gloves' | 'chaps' | 'life_jacket';

/** One paired gear tag, as heard by the equipment. */
export interface GearReading {
  type: GearType;
  /** The equipment heard this tag's heartbeat recently. */
  connected: boolean;
  /** Wearing sensor; null/missing = the tag has none. */
  worn?: boolean | null;
}

/** Body of POST /api/devices/:deviceId/telemetry. See shared/PROTOCOL.md. */
export interface Telemetry {
  /** Scooter received a helmet heartbeat within its own 15 s window. */
  helmet_connected: boolean;
  /** null = hardware has no wearing sensor (yet). */
  helmet_worn: boolean | null;
  /** null = no GPS (yet) or no fix. */
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  battery_percent: number | null;
  /** null = hardware has no accelerometer (yet). */
  crash_detected: boolean | null;
  /**
   * The equipment is in use: tool switched on, saw running, boat under way.
   * null/missing = the hardware can't tell; a device that is reporting is then assumed in use.
   */
  equipment_active?: boolean | null;
  /**
   * One entry per paired gear tag. When present it replaces helmet_connected /
   * helmet_worn for the safety check. null/missing = single-tag hardware.
   */
  gear?: GearReading[] | null;
  /** The equipment is currently locked out (can't be started). null = no lock hardware. */
  locked?: boolean | null;
}

/** A map point. Used for the corners of a drawn safe zone. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

export type GeofenceShape = 'circle' | 'polygon';

/**
 * Safe zone, as returned by the API.
 *
 * - Circle (default): `latitude` / `longitude` is the centre, `radius_m` the radius.
 * - Polygon: `shape` is "polygon" and `points` holds the corners in drawing order
 *   (the last corner connects back to the first). `latitude`, `longitude` and
 *   `radius_m` are then filled in by the server with a circle that encloses the
 *   shape, so clients that only know circles still have something to show.
 */
export interface Geofence {
  latitude: number;
  longitude: number;
  radius_m: number;
  /** Missing = "circle". */
  shape?: GeofenceShape;
  /** Corners of a polygon zone. Only present when `shape` is "polygon". */
  points?: GeoPoint[];
}

/** Body of PUT /api/devices/:deviceId/geofence: a circle, or a drawn polygon. */
export type GeofenceInput =
  | { shape?: 'circle'; latitude: number; longitude: number; radius_m: number }
  | { shape: 'polygon'; points: GeoPoint[] };

/** Conditions that raise an alert while they are active. */
export type AlertType =
  | 'helmet_disconnected'
  | 'helmet_not_worn'
  | 'crash_detected'
  | 'geofence_exit'
  | 'scooter_offline'
  /** Equipment in use while required protective gear is missing or not worn. */
  | 'unprotected_use';

/** Logged when an active condition ends. */
export type RecoveryType =
  | 'helmet_reconnected'
  | 'helmet_worn'
  | 'crash_cleared'
  | 'geofence_enter'
  | 'scooter_online'
  | 'protection_restored';

export type SafetyEventType = AlertType | RecoveryType;
export type Severity = 'alert' | 'recovery';

/** One row of the safety history. Created only on state transitions. */
export interface SafetyEvent {
  id: number;
  device_id: string;
  type: SafetyEventType;
  severity: Severity;
  message: string;
  /** ISO 8601, server clock. */
  created_at: string;
  /** Where the scooter was when it happened, if known. */
  latitude: number | null;
  longitude: number | null;
}

export type ZoneStatus = 'inside' | 'outside' | 'unknown';

/** State of one piece of required gear. 'unknown' = no tag for it, or no data. */
export type GearState = 'ok' | 'missing' | 'not_worn' | 'unknown';

export interface GearStatus {
  type: GearType;
  state: GearState;
}

export interface LastLocation {
  latitude: number;
  longitude: number;
  /** ISO 8601 time of the reading. */
  at: string;
}

/** Everything the app needs to render one scooter. */
export interface DeviceState {
  device_id: string;
  name: string;
  /** Name of the child who rides this scooter; null/missing = not set. Same value as operator_name. */
  child_name?: string | null;
  /** What the device is attached to. */
  kind?: EquipmentKind;
  /** Who uses this equipment (worker, skipper, rider); null = not set. */
  operator_name?: string | null;
  /** Where it is used, e.g. "Workshop A"; null = not set. */
  site?: string | null;
  /** Gear that must be present while the equipment is in use. */
  required_gear?: GearType[];
  /** One entry per required gear item, from the latest reading. */
  gear_status?: GearStatus[];
  /** In use right now; null = unknown (offline or never reported). */
  in_use?: boolean | null;
  /** Lock the equipment when required gear is missing (needs lock hardware). */
  auto_lock?: boolean;
  /** The server is currently telling the equipment to stay locked. */
  lock_engaged?: boolean;
  /**
   * Scooter sent telemetry within the last 30 s.
   * false + helmet data present means "scooter offline", NOT "helmet disconnected":
   * when offline, `telemetry` is only the last known reading.
   */
  online: boolean;
  /** ISO 8601 time of the last telemetry; null = never reported. */
  last_seen_at: string | null;
  /** Latest reading as sent by the scooter; null = never reported. */
  telemetry: Telemetry | null;
  /** Last valid GPS position, kept when later readings have no GPS. */
  last_location: LastLocation | null;
  /** Alert conditions that are active right now. */
  active_alerts: AlertType[];
  geofence: Geofence | null;
  /** 'unknown' when there is no geofence or no valid GPS in the latest reading. */
  zone_status: ZoneStatus;
  /** ISO 8601 server clock, so clients can show "12 s ago" without clock skew. */
  server_time: string;
}

/** Body of PATCH /api/devices/:deviceId. Send only the fields to change. */
export interface DeviceUpdate {
  name?: string;
  /** null clears the name. */
  child_name?: string | null;
  kind?: EquipmentKind;
  /** null clears it. Same field as child_name. */
  operator_name?: string | null;
  /** null clears it. */
  site?: string | null;
  required_gear?: GearType[];
  auto_lock?: boolean;
}

export interface DevicesResponse {
  devices: DeviceState[];
}

export interface AlertsResponse {
  /** Newest first. */
  alerts: SafetyEvent[];
}

export interface TelemetryAccepted {
  ok: true;
  received_at: string;
  /** true = keep the equipment locked (auto-lock is on and required gear is missing). */
  lock?: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  details?: { path: string; message: string }[];
}

export type DemoScenario =
  | 'normal'
  | 'helmet-disconnect'
  | 'helmet-reconnect'
  | 'helmet-not-worn'
  | 'crash'
  | 'geofence-exit'
  | 'offline'
  | 'gear-removed'
  | 'gear-back'
  | 'idle';

export interface DemoStatus {
  /** false = server started without DEMO_MODE; POST is rejected. */
  enabled: boolean;
  running: boolean;
  scenario: DemoScenario | null;
  device_id: string | null;
  /** Every simulated device and its scenario. */
  runs?: { device_id: string; scenario: DemoScenario }[];
  /** Devices the demo can simulate. */
  devices?: string[];
}

/** Payloads of the Server-Sent Events on GET /api/stream, keyed by event name. */
export interface StreamEvents {
  /** Sent once on connect. */
  hello: DevicesResponse;
  /** A device's state changed (every telemetry, offline timeout, geofence edit). */
  state: DeviceState;
  /** A new safety event was logged. */
  alert: SafetyEvent;
}
