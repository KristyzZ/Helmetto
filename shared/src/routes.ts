/** Route constants. Additive only: never rename or remove. */
export const API_PREFIX = '/api';

/** Express-style patterns, used by the API router. */
export const ROUTE_PATTERNS = {
  health: '/api/health',
  telemetry: '/api/devices/:deviceId/telemetry',
  devices: '/api/devices',
  device: '/api/devices/:deviceId',
  deviceState: '/api/devices/:deviceId/state',
  deviceAlerts: '/api/devices/:deviceId/alerts',
  deviceGeofence: '/api/devices/:deviceId/geofence',
  stream: '/api/stream',
  demo: '/api/demo',
  alertAck: '/api/alerts/:eventId/ack',
  devicePlaces: '/api/devices/:deviceId/places',
  devicePlace: '/api/devices/:deviceId/places/:placeId',
} as const;

const id = (deviceId: string) => encodeURIComponent(deviceId);

/** URL builders, used by clients (web app, simulator). */
export const routes = {
  health: () => '/api/health',
  telemetry: (deviceId: string) => `/api/devices/${id(deviceId)}/telemetry`,
  devices: () => '/api/devices',
  device: (deviceId: string) => `/api/devices/${id(deviceId)}`,
  deviceState: (deviceId: string) => `/api/devices/${id(deviceId)}/state`,
  deviceAlerts: (deviceId: string) => `/api/devices/${id(deviceId)}/alerts`,
  deviceGeofence: (deviceId: string) => `/api/devices/${id(deviceId)}/geofence`,
  stream: () => '/api/stream',
  demo: () => '/api/demo',
  alertAck: (eventId: number) => `/api/alerts/${eventId}/ack`,
  devicePlaces: (deviceId: string) => `/api/devices/${id(deviceId)}/places`,
  devicePlace: (deviceId: string, placeId: number) => `/api/devices/${id(deviceId)}/places/${placeId}`,
} as const;

/** Header carrying the per-device API key on telemetry requests. */
export const DEVICE_KEY_HEADER = 'X-Device-Key';
