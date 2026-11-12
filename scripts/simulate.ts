/**
 * Mock scooter. Posts real telemetry to the real API, exactly like the hardware.
 *
 *   npm run simulate                                  # normal ride against localhost
 *   npm run simulate -- --scenario helmet-disconnect
 *   npm run simulate -- --url https://your-app.onrender.com --minimal
 *
 * While it runs, press 1-7 to switch scenario, q to quit.
 * Device id and key come from .env (DEVICE_ID, DEVICE_API_KEY) or the flags below.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEMO_SCENARIOS, type DemoScenario } from '@helmetto/shared';
import { DEFAULT_HOME, Simulator } from './lib/simulator';

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'));
} catch {
  // no .env: use flags, real env vars or the dev defaults
}

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', short: 's', default: 'normal' },
    url: { type: 'string', short: 'u' },
    'device-id': { type: 'string' },
    key: { type: 'string' },
    interval: { type: 'string', short: 'i' },
    lat: { type: 'string' },
    lon: { type: 'string' },
    minimal: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const scenarioIds = DEMO_SCENARIOS.map((s) => s.id);

if (values.help) {
  console.log(`Usage: npm run simulate -- [options]

  -s, --scenario <name>   ${scenarioIds.join(' | ')}  (default: normal)
  -u, --url <url>         API base URL (default: SIM_URL or http://localhost:3000)
      --device-id <id>    default: DEVICE_ID or scooter-001
      --key <key>         default: DEVICE_API_KEY or the dev key
  -i, --interval <ms>     telemetry interval (default: 5000)
      --lat, --lon        ride center when no safe zone is set (default: Vilnius)
      --minimal           send only helmet_connected, other fields null (like today's hardware)
`);
  process.exit(0);
}

if (!scenarioIds.includes(values.scenario as DemoScenario)) {
  console.error(`Unknown scenario "${values.scenario}". Use one of: ${scenarioIds.join(', ')}`);
  process.exit(1);
}

const baseUrl = (values.url ?? process.env.SIM_URL ?? `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const deviceId = values['device-id'] ?? process.env.DEVICE_ID ?? 'scooter-001';
const apiKey = values.key ?? process.env.DEVICE_API_KEY ?? 'dev-device-key-change-me';

const simulator = new Simulator({
  baseUrl,
  deviceId,
  apiKey,
  intervalMs: values.interval ? Number(values.interval) : undefined,
  home: {
    latitude: values.lat ? Number(values.lat) : DEFAULT_HOME.latitude,
    longitude: values.lon ? Number(values.lon) : DEFAULT_HOME.longitude,
  },
  minimal: values.minimal,
  log: (line) => console.log(`${new Date().toLocaleTimeString()} ${line}`),
});

console.log(`Simulating device "${deviceId}" -> ${baseUrl}`);
simulator.start(values.scenario as DemoScenario);

if (process.stdin.isTTY) {
  console.log(DEMO_SCENARIOS.map((s, i) => `  [${i + 1}] ${s.label}`).join('\n') + '\n  [q] quit');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    const key = data.toString();
    if (key === 'q' || key === '\u0003') {
      simulator.stop();
      process.exit(0);
    }
    const scenario = DEMO_SCENARIOS[Number(key) - 1];
    if (scenario) simulator.setScenario(scenario.id);
  });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
