import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NO_CONDITIONS, type Conditions } from '@helmetto/ai';
import type { Geofence, LastLocation, SafetyEvent, Telemetry } from '@helmetto/shared';

export const DEMO_PARENT_ID = 'parent-demo';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  telemetry TEXT,
  conditions TEXT,
  last_lat REAL,
  last_lon REAL,
  last_location_at INTEGER,
  geofence_lat REAL,
  geofence_lon REAL,
  geofence_radius_m REAL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  latitude REAL,
  longitude REAL
);
CREATE INDEX IF NOT EXISTS events_by_device ON events(device_id, id DESC);
`;

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** One device as stored. Times are epoch milliseconds. */
export interface DeviceRow {
  id: string;
  parentId: string;
  name: string;
  lastSeenAt: number | null;
  telemetry: Telemetry | null;
  conditions: Conditions;
  lastLocation: (Omit<LastLocation, 'at'> & { at: number }) | null;
  geofence: Geofence | null;
}

type Raw = Record<string, any>;

function toDevice(raw: Raw): DeviceRow {
  return {
    id: raw.id,
    parentId: raw.parent_id,
    name: raw.name,
    lastSeenAt: raw.last_seen_at ?? null,
    telemetry: raw.telemetry ? JSON.parse(raw.telemetry) : null,
    conditions: raw.conditions ? { ...NO_CONDITIONS, ...JSON.parse(raw.conditions) } : { ...NO_CONDITIONS },
    lastLocation:
      raw.last_lat != null && raw.last_lon != null
        ? { latitude: raw.last_lat, longitude: raw.last_lon, at: raw.last_location_at }
        : null,
    geofence:
      raw.geofence_lat != null
        ? { latitude: raw.geofence_lat, longitude: raw.geofence_lon, radius_m: raw.geofence_radius_m }
        : null,
  };
}

function toEvent(raw: Raw): SafetyEvent {
  return {
    id: raw.id,
    device_id: raw.device_id,
    type: raw.type,
    severity: raw.severity,
    message: raw.message,
    created_at: new Date(raw.created_at).toISOString(),
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
  };
}

export class Store {
  private db: DatabaseSync;

  /** Pass ':memory:' for tests. */
  constructor(filename: string) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.db
      .prepare('INSERT OR IGNORE INTO parents (id, name) VALUES (?, ?)')
      .run(DEMO_PARENT_ID, 'Demo parent');
  }

  /** Create the device or refresh its key/name from env. Only the key hash is stored. */
  seedDevice(device: { id: string; apiKey: string; name: string }, parentId = DEMO_PARENT_ID): void {
    this.db
      .prepare(
        `INSERT INTO devices (id, parent_id, name, api_key_hash, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET api_key_hash = excluded.api_key_hash, name = excluded.name`,
      )
      .run(device.id, parentId, device.name, hashKey(device.apiKey), Date.now());
  }

  verifyDeviceKey(deviceId: string, key: string): 'ok' | 'unknown_device' | 'bad_key' {
    const row = this.db.prepare('SELECT api_key_hash FROM devices WHERE id = ?').get(deviceId) as Raw | undefined;
    if (!row) return 'unknown_device';
    const expected = Buffer.from(row.api_key_hash, 'hex');
    const actual = Buffer.from(hashKey(key), 'hex');
    return timingSafeEqual(expected, actual) ? 'ok' : 'bad_key';
  }

  listDevices(parentId?: string): DeviceRow[] {
    const rows = parentId
      ? this.db.prepare('SELECT * FROM devices WHERE parent_id = ? ORDER BY created_at, id').all(parentId)
      : this.db.prepare('SELECT * FROM devices ORDER BY created_at, id').all();
    return (rows as Raw[]).map(toDevice);
  }

  getDevice(deviceId: string): DeviceRow | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Raw | undefined;
    return row ? toDevice(row) : null;
  }

  saveDevice(device: DeviceRow): void {
    this.db
      .prepare(
        `UPDATE devices SET last_seen_at = ?, telemetry = ?, conditions = ?,
           last_lat = ?, last_lon = ?, last_location_at = ?,
           geofence_lat = ?, geofence_lon = ?, geofence_radius_m = ?
         WHERE id = ?`,
      )
      .run(
        device.lastSeenAt,
        device.telemetry ? JSON.stringify(device.telemetry) : null,
        JSON.stringify(device.conditions),
        device.lastLocation?.latitude ?? null,
        device.lastLocation?.longitude ?? null,
        device.lastLocation?.at ?? null,
        device.geofence?.latitude ?? null,
        device.geofence?.longitude ?? null,
        device.geofence?.radius_m ?? null,
        device.id,
      );
  }

  addEvent(event: Omit<SafetyEvent, 'id' | 'created_at'> & { created_at: number }): SafetyEvent {
    const result = this.db
      .prepare(
        `INSERT INTO events (device_id, type, severity, message, created_at, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.device_id,
        event.type,
        event.severity,
        event.message,
        event.created_at,
        event.latitude,
        event.longitude,
      );
    return { ...event, id: Number(result.lastInsertRowid), created_at: new Date(event.created_at).toISOString() };
  }

  /** Newest first. `beforeId` pages further back. */
  listEvents(deviceId: string, limit: number, beforeId?: number): SafetyEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE device_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(deviceId, beforeId ?? Number.MAX_SAFE_INTEGER, limit);
    return (rows as Raw[]).map(toEvent);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
