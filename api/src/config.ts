import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_TIMEOUT_MS } from '@helmetto/shared';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Config {
  port: number;
  databasePath: string;
  /** Demo device seeded on startup. */
  device: { id: string; apiKey: string; name: string; childName: string | null };
  demoMode: boolean;
  offlineTimeoutMs: number;
  webDist: string;
}

/** Dev-only fallbacks so `npm run dev` works without a .env. Never used in production. */
export const DEV_DEVICE_ID = 'scooter-001';
export const DEV_DEVICE_API_KEY = 'dev-device-key-change-me';

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
  return {
    port: Number(env.PORT) || 3000,
    databasePath: env.DATABASE_PATH || path.join(REPO_ROOT, 'data', 'helmetto.db'),
    device: {
      id: env.DEVICE_ID || DEV_DEVICE_ID,
      apiKey: env.DEVICE_API_KEY || DEV_DEVICE_API_KEY,
      name: env.DEVICE_NAME || 'Demo scooter',
      // Used only when the device has no child name yet; the parent can change it in the app.
      childName: env.DEVICE_CHILD_NAME || (production ? null : 'Emma'),
    },
    demoMode: env.DEMO_MODE ? env.DEMO_MODE === 'true' : !production,
    offlineTimeoutMs: Number(env.OFFLINE_TIMEOUT_MS) || OFFLINE_TIMEOUT_MS,
    webDist: path.join(REPO_ROOT, 'web', 'dist'),
  };
}
