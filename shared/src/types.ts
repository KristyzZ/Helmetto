/**
 * Helmetto shared contract. Imported by web/, api/, ai/ and scripts/.
 * RULE: additive changes only. Add optional fields; never rename or remove.
 * The wire format is snake_case everywhere.
 */

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
  | 'scooter_offline';

/** Logged when an active condition ends. */
export type RecoveryType =
  | 'helmet_reconnected'
  | 'helmet_worn'
  | 'crash_cleared'
  | 'geofence_enter'
  | 'scooter_online';

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
  /** Name of the child who rides this scooter; null/missing = not set. */
  child_name?: string | null;
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
  | 'offline';

export interface DemoStatus {
  /** false = server started without DEMO_MODE; POST is rejected. */
  enabled: boolean;
  running: boolean;
  scenario: DemoScenario | null;
  device_id: string | null;
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
