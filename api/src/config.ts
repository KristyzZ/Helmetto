import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { EQUIPMENT_KINDS, OFFLINE_TIMEOUT_MS, type EquipmentKind } from '@helmetto/shared';
import type { SeedDevice } from './db';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Config {
  port: number;
  databasePath: string;
  /** The hardware device, seeded on startup from env. */
  device: SeedDevice;
  /** Extra simulated devices (demo mode only): a forestry chainsaw. */
  demoDevices: SeedDevice[];
  /** Demo workers and which equipment their tags are heard at (demo mode only). */
  demoWorkers: DemoWorker[];
  /** Worker tag each simulated device sends: [usual, the one "switch-worker" swaps to]. */
  demoWorkerTags: Record<string, [string, string]>;
  demoMode: boolean;
  offlineTimeoutMs: number;
  webDist: string;
}

/** Dev-only fallbacks so `npm run dev` works without a .env. Never used in production. */
export const DEV_DEVICE_ID = 'scooter-001';
export const DEV_DEVICE_API_KEY = 'dev-device-key-change-me';

/** Simulated equipment for the fleet demo. Keys are random per server start. */
export interface DemoWorker {
  id: string;
  name: string;
  role: string;
  tagId: string;
}

const DEMO_WORKERS: DemoWorker[] = [
  { id: 'demo-w-tomas', name: 'Tomas Petraitis', role: 'Metalworker', tagId: 'TAG-0001' },
  { id: 'demo-w-mantas', name: 'Mantas Jonaitis', role: 'Arborist', tagId: 'TAG-0002' },
  { id: 'demo-w-lukas', name: 'Lukas Kazlauskas', role: 'Apprentice', tagId: 'TAG-0003' },
];

const DEMO_DEVICES: Omit<SeedDevice, 'apiKey'>[] = [
  {
    id: 'demo-chainsaw',
    name: 'Chainsaw',
    kind: 'chainsaw',
    childName: 'Mantas',
    site: 'Pavilniai forest',
    autoLock: true,
    geofence: { latitude: 54.6745, longitude: 25.329, radius_m: 150 },
  },
];

export function loadEnvFile(): void {
  try {
    process.loadEnvFile(path.join(REPO_ROOT, '.env'));
  } catch {
    // no .env file: rely on real environment variables
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  if (production && (!env.DEVICE_ID || !env.DEVICE_API_KEY)) {
    throw new Error('DEVICE_ID and DEVICE_API_KEY must be set in production');
  }
  if (!production && !env.DEVICE_API_KEY) {
    console.warn('[config] DEVICE_API_KEY not set: using the insecure dev default');
  }
  const kind = (EQUIPMENT_KINDS as string[]).includes(env.DEVICE_KIND ?? '') ? (env.DEVICE_KIND as EquipmentKind) : 'power_tool';
  const demoMode = env.DEMO_MODE ? env.DEMO_MODE === 'true' : !production;
  return {
    port: Number(env.PORT) || 3000,
    databasePath: env.DATABASE_PATH || path.join(REPO_ROOT, 'data', 'helmetto.db'),
    device: {
      id: env.DEVICE_ID || DEV_DEVICE_ID,
      apiKey: env.DEVICE_API_KEY || DEV_DEVICE_API_KEY,
      name: env.DEVICE_NAME || 'Angle grinder',
      kind,
      // Used only when the device is created; the manager can change them in the app.
      childName: env.DEVICE_OPERATOR || env.DEVICE_CHILD_NAME || (production ? null : 'Tomas'),
      site: env.DEVICE_SITE || 'Workshop',
      autoLock: env.DEVICE_AUTO_LOCK === 'true',
    },
    demoDevices: demoMode ? DEMO_DEVICES.map((d) => ({ ...d, apiKey: randomBytes(18).toString('hex') })) : [],
    demoWorkers: demoMode ? DEMO_WORKERS : [],
    demoWorkerTags: demoMode
      ? { [env.DEVICE_ID || DEV_DEVICE_ID]: ['TAG-0001', 'TAG-0003'], 'demo-chainsaw': ['TAG-0002', 'TAG-0003'] }
      : {},
    demoMode,
    offlineTimeoutMs: Number(env.OFFLINE_TIMEOUT_MS) || OFFLINE_TIMEOUT_MS,
    webDist: path.join(REPO_ROOT, 'web', 'dist'),
  };
}
