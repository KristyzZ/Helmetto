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
} from '@helmetto/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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
  demoStatus: () => request<DemoStatus>(routes.demo()),
  runDemo: (scenario: DemoScenario | 'stop') => request<DemoStatus>(routes.demo(), json('POST', { scenario })),
};
