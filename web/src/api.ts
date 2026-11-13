import {
  routes,
  type AlertsResponse,
  type ApiError,
  type DemoScenario,
  type DemoStatus,
  type DeviceState,
  type CreateDeviceRequest,
  type CreateDeviceResponse,
  type DeviceUpdate,
  type ReportResponse,
  type SafetyEvent,
  type CreateWorkerRequest,
  type Worker,
  type WorkersResponse,
  type WorkerUpdate,
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
  createDevice: (input: CreateDeviceRequest) => request<CreateDeviceResponse>(routes.devices(), json('POST', input)),
  deleteDevice: async (deviceId: string) => {
    const res = await fetch(routes.device(deviceId), { method: 'DELETE' });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as ApiError).message || `Request failed (${res.status})`);
  },
  acknowledge: (eventId: number, by: string | null) => request<SafetyEvent>(routes.alertAck(eventId), json('POST', { by })),
  report: (days: number) => request<ReportResponse>(routes.report(days)),
  workers: () => request<WorkersResponse>(routes.workers()),
  createWorker: (input: CreateWorkerRequest) => request<Worker>(routes.workers(), json('POST', input)),
  updateWorker: (workerId: string, update: WorkerUpdate) => request<Worker>(routes.worker(workerId), json('PATCH', update)),
  deleteWorker: async (workerId: string) => {
    const res = await fetch(routes.worker(workerId), { method: 'DELETE' });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as ApiError).message || `Request failed (${res.status})`);
  },
  demoStatus: () => request<DemoStatus>(routes.demo()),
  runDemo: (scenario: DemoScenario | 'stop' | 'start-all', deviceId?: string) =>
    request<DemoStatus>(routes.demo(), json('POST', { scenario, device_id: deviceId })),
};
