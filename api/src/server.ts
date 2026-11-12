import { createApp } from './app';
import { loadConfig, loadEnvFile } from './config';
import { Store } from './db';
import { DemoRunner } from './demo';
import { SafetyService } from './service';

const SWEEP_INTERVAL_MS = 2_000;

loadEnvFile();
const config = loadConfig();
const store = new Store(config.databasePath);
store.seedDevice(config.device);

const service = new SafetyService(store, { offlineTimeoutMs: config.offlineTimeoutMs });
const demo = new DemoRunner(config);
const app = createApp({ config, store, service, demo });

const sweep = setInterval(() => service.sweepOffline(), SWEEP_INTERVAL_MS);

const server = app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  console.log(`[api] device "${config.device.id}" ready, demo mode ${config.demoMode ? 'on' : 'off'}`);
});

function shutdown() {
  clearInterval(sweep);
  demo.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeAllConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
