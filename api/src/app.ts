import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  DEMO_SCENARIOS,
  DEVICE_KEY_HEADER,
  ROUTE_PATTERNS,
  type AlertsResponse,
  type ApiError,
  type DevicesResponse,
  type TelemetryAccepted,
} from '@helmetto/shared';
import type { Config } from './config';
import type { Store } from './db';
import type { DemoRunner } from './demo';
import type { SafetyService } from './service';
import { deviceUpdateSchema, geofenceSchema, telemetrySchema, validationError } from './validation';

const SSE_KEEPALIVE_MS = 15_000;

const fail = (res: Response, status: number, error: string, message: string) =>
  res.status(status).json({ error, message } satisfies ApiError);

const demoSchema = z.object({
  scenario: z.enum(['stop', ...DEMO_SCENARIOS.map((s) => s.id)] as [string, ...string[]]),
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

    service.ingestTelemetry(deviceId, parsed.data);
    res.json({ ok: true, received_at: new Date().toISOString() } satisfies TelemetryAccepted);
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

  app.patch(ROUTE_PATTERNS.device, (req, res) => {
    const parsed = deviceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));
    const state = service.updateDevice(String(req.params.deviceId), parsed.data);
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
    service.on('state', onState);
    service.on('alert', onAlert);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), SSE_KEEPALIVE_MS);
    req.on('close', () => {
      clearInterval(keepalive);
      service.off('state', onState);
      service.off('alert', onAlert);
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
    const { scenario } = parsed.data;
    res.json(scenario === 'stop' ? demo.stop() : demo.run(scenario as never));
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
