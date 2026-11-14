import {
  routes,
  type AlertsResponse,
  type ApiError,
  type DemoScenario,
  type DemoStatus,
  type DeviceState,
  type DeviceUpdate,
  type DevicesResponse,
  type GeofenceInput,
  type PlaceInput,
  type SafetyEvent,
} from '@helmetto/shared';

/**
 * Where the server is. Empty = the same address the app was loaded from (the
 * website). The iOS app is loaded from inside the phone, so it is built with
 * VITE_API_URL set to the deployed server, e.g. https://helmetto.onrender.com.
 */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as ApiError).message || message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  devices: () => request<DevicesResponse>(routes.devices()),
  alerts: (deviceId: string) => request<AlertsResponse>(routes.deviceAlerts(deviceId)),
  setGeofence: (deviceId: string, geofence: GeofenceInput) =>
    request<DeviceState>(routes.deviceGeofence(deviceId), json('PUT', geofence)),
  clearGeofence: (deviceId: string) =>
    request<DeviceState>(routes.deviceGeofence(deviceId), { method: 'DELETE' }),
  updateDevice: (deviceId: string, update: DeviceUpdate) =>
    request<DeviceState>(routes.device(deviceId), json('PATCH', update)),
  addPlace: (deviceId: string, place: PlaceInput) => request<DeviceState>(routes.devicePlaces(deviceId), json('POST', place)),
  deletePlace: (deviceId: string, placeId: number) =>
    request<DeviceState>(routes.devicePlace(deviceId, placeId), { method: 'DELETE' }),
  acknowledge: (eventId: number, by: string | null) => request<SafetyEvent>(routes.alertAck(eventId), json('POST', { by })),
  demoStatus: () => request<DemoStatus>(routes.demo()),
  runDemo: (scenario: DemoScenario | 'stop') => request<DemoStatus>(routes.demo(), json('POST', { scenario })),
};
