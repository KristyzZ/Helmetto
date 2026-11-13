import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ALL_DEMO_SCENARIOS,
  DEVICE_KEY_HEADER,
  ROUTE_PATTERNS,
  type AlertsResponse,
  type ApiError,
  type DemoScenario,
  type CreateDeviceRequest,
  type DeviceUpdate,
  type DevicesResponse,
  type WorkersResponse,
  type Telemetry,
  type TelemetryAccepted,
} from '@helmetto/shared';
import type { Config } from './config';
import type { Store } from './db';
import type { DemoRunner } from './demo';
import { TagInUseError, type SafetyService } from './service';
import {
  acknowledgeSchema,
  createDeviceSchema,
  createWorkerSchema,
  deviceUpdateSchema,
  geofenceSchema,
  telemetrySchema,
  validationError,
  workerUpdateSchema,
} from './validation';
import { reportCsv } from './report';

const SSE_KEEPALIVE_MS = 15_000;

const fail = (res: Response, status: number, error: string, message: string) =>
  res.status(status).json({ error, message } satisfies ApiError);

const demoSchema = z.object({
  scenario: z.enum(['stop', 'start-all', ...ALL_DEMO_SCENARIOS] as [string, ...string[]]),
  /** Which simulated device; default = the hardware device. */
  device_id: z.string().optional(),
});

export function createApp(deps: {
  config: Config;
  store: Store;
  service: SafetyService;
  demo?: DemoRunner;
}) {
  const { config, store, service, demo } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '8kb' }));

  app.get(ROUTE_PATTERNS.health, (_req, res) => {
    res.json({ ok: true, server_time: new Date().toISOString() });
  });

  // ---- Hardware: telemetry ingest -------------------------------------------------
  app.post(ROUTE_PATTERNS.telemetry, (req, res) => {
    const deviceId = String(req.params.deviceId);
    const key = req.get(DEVICE_KEY_HEADER);
    if (!key) return fail(res, 401, 'missing_device_key', `Send the device API key in the ${DEVICE_KEY_HEADER} header`);
    const auth = store.verifyDeviceKey(deviceId, key);
    if (auth === 'unknown_device') return fail(res, 404, 'unknown_device', `No device with id "${deviceId}"`);
    if (auth === 'bad_key') return fail(res, 401, 'invalid_device_key', 'The device API key is wrong for this device');

    const parsed = telemetrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));

    const { lock } = service.ingestTelemetry(deviceId, parsed.data as Telemetry);
    res.json({ ok: true, received_at: new Date().toISOString(), lock } satisfies TelemetryAccepted);
  });

  // ---- Parent app -----------------------------------------------------------------
  app.get(ROUTE_PATTERNS.devices, (_req, res) => {
    res.json({ devices: service.listStates() } satisfies DevicesResponse);
  });

  app.get(ROUTE_PATTERNS.deviceState, (req, res) => {
    const state = service.getState(String(req.params.deviceId));
    if (!state) return fail(res, 404, 'unknown_device', 'No such device');
    res.json(state);
  });

  app.post(ROUTE_PATTERNS.devices, (req, res) => {
    const parsed = createDeviceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    res.status(201).json(service.createDevice(parsed.data as CreateDeviceRequest));
  });

  app.delete(ROUTE_PATTERNS.device, (req, res) => {
    const deviceId = String(req.params.deviceId);
    if (deviceId === config.device.id) {
      return fail(res, 409, 'configured_device', 'This device is configured on the server (DEVICE_ID) and comes back on restart');
    }
    if (!service.deleteDevice(deviceId)) return fail(res, 404, 'unknown_device', 'No such device');
    res.status(204).end();
  });

  // ---- Workers ---------------------------------------------------------------------
  const tagConflict = (res: Response, error: unknown) => {
    if (error instanceof TagInUseError) return fail(res, 409, 'tag_in_use', error.message);
    throw error;
  };

  app.get(ROUTE_PATTERNS.workers, (_req, res) => {
    res.json({ workers: service.listWorkers() } satisfies WorkersResponse);
  });

  app.post(ROUTE_PATTERNS.workers, (req, res) => {
    const parsed = createWorkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    try {
      res.status(201).json(service.createWorker(parsed.data));
    } catch (error) {
      tagConflict(res, error);
    }
  });

  app.patch(ROUTE_PATTERNS.worker, (req, res) => {
    const parsed = workerUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    try {
      const worker = service.updateWorker(String(req.params.workerId), parsed.data);
      if (!worker) return fail(res, 404, 'unknown_worker', 'No such worker');
      res.json(worker);
    } catch (error) {
      tagConflict(res, error);
    }
  });

  app.delete(ROUTE_PATTERNS.worker, (req, res) => {
    if (!service.deleteWorker(String(req.params.workerId))) return fail(res, 404, 'unknown_worker', 'No such worker');
    res.status(204).end();
  });

  app.post(ROUTE_PATTERNS.alertAck, (req, res) => {
    const parsed = acknowledgeSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    const event = service.acknowledge(Number(req.params.eventId), parsed.data.by ?? null);
    if (!event) return fail(res, 404, 'unknown_alert', 'No alert with that id');
    res.json(event);
  });

  const reportDays = (value: unknown) => Math.min(Math.max(Math.round(Number(value)) || 7, 1), 90);

  app.get(ROUTE_PATTERNS.report, (req, res) => {
    res.json(service.report(reportDays(req.query.days)));
  });

  app.get(ROUTE_PATTERNS.reportCsv, (req, res) => {
    const report = service.report(reportDays(req.query.days));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="helmetto-report-${report.from}-to-${report.to}.csv"`);
    res.send(reportCsv(report));
  });

  app.patch(ROUTE_PATTERNS.device, (req, res) => {
    const parsed = deviceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    const state = service.updateDevice(String(req.params.deviceId), parsed.data as DeviceUpdate);
    if (!state) return fail(res, 404, 'unknown_device', 'No such device');
    res.json(state);
  });

  app.get(ROUTE_PATTERNS.deviceAlerts, (req, res) => {
    const deviceId = String(req.params.deviceId);
    if (!store.getDevice(deviceId)) return fail(res, 404, 'unknown_device', 'No such device');
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const before = Number(req.query.before) || undefined;
    res.json({ alerts: store.listEvents(deviceId, limit, before) } satisfies AlertsResponse);
  });

  app.put(ROUTE_PATTERNS.deviceGeofence, (req, res) => {
    const parsed = geofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    const state = service.setGeofence(String(req.params.deviceId), parsed.data);
    if (!state) return fail(res, 404, 'unknown_device', 'No such device');
    res.json(state);
  });

  app.delete(ROUTE_PATTERNS.deviceGeofence, (req, res) => {
    const state = service.setGeofence(String(req.params.deviceId), null);
    if (!state) return fail(res, 404, 'unknown_device', 'No such device');
    res.json(state);
  });

  // ---- Live updates (Server-Sent Events) ------------------------------------------
  app.get(ROUTE_PATTERNS.stream, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    res.write('retry: 3000\n\n');
    send('hello', { devices: service.listStates() } satisfies DevicesResponse);

    const onState = (state: unknown) => send('state', state);
    const onAlert = (alert: unknown) => send('alert', alert);
    const onAlertUpdate = (event: unknown) => send('alert_update', event);
    const onRemoved = (removed: unknown) => send('device_removed', removed);
    const onWorker = (worker: unknown) => send('worker', worker);
    const onWorkerRemoved = (removed: unknown) => send('worker_removed', removed);
    service.on('state', onState);
    service.on('alert', onAlert);
    service.on('alert_update', onAlertUpdate);
    service.on('device_removed', onRemoved);
    service.on('worker', onWorker);
    service.on('worker_removed', onWorkerRemoved);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), SSE_KEEPALIVE_MS);
    req.on('close', () => {
      clearInterval(keepalive);
      service.off('state', onState);
      service.off('alert', onAlert);
      service.off('alert_update', onAlertUpdate);
      service.off('device_removed', onRemoved);
      service.off('worker', onWorker);
      service.off('worker_removed', onWorkerRemoved);
    });
  });

  // ---- Demo panel -----------------------------------------------------------------
  app.get(ROUTE_PATTERNS.demo, (_req, res) => {
    res.json(demo?.status() ?? { enabled: false, running: false, scenario: null, device_id: null });
  });

  app.post(ROUTE_PATTERNS.demo, (req, res) => {
    if (!demo || !config.demoMode) return fail(res, 403, 'demo_disabled', 'Start the server with DEMO_MODE=true');
    const parsed = demoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    const { scenario, device_id } = parsed.data;
    if (scenario === 'stop') return res.json(demo.stop(device_id));
    if (scenario === 'start-all') return res.json(demo.startAll());
    const status = demo.run(scenario as DemoScenario, device_id);
    if (!status) return fail(res, 404, 'unknown_device', 'The demo cannot simulate that device');
    res.json(status);
  });

  app.use('/api', (_req, res) => fail(res, 404, 'not_found', 'No such API route'));

  // ---- Built web app (production) -------------------------------------------------
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    app.use(
      express.static(config.webDist, {
        setHeaders(res, file) {
          const immutable = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(/.*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error?.type === 'entity.parse.failed') {
      return fail(res, 400, 'invalid_json', 'Request body is not valid JSON');
    }
    if (error?.type === 'entity.too.large') {
      return fail(res, 413, 'payload_too_large', 'Request body is too large');
    }
    console.error(error);
    fail(res, 500, 'internal_error', 'Unexpected server error');
  });

  return app;
}
