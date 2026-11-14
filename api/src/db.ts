import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NO_CONDITIONS, type Conditions } from '@helmetto/ai';
import type { Geofence, LastLocation, Place, PlaceInput, SafetyEvent, Telemetry } from '@helmetto/shared';

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
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id),
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_m REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS places_by_device ON places(device_id, id);
`;

/** Columns added after the first release; applied to existing databases on start. */
const ADDED_COLUMNS: Record<string, string> = {
  child_name: 'TEXT',
  geofence_points: 'TEXT', // JSON [{lat, lon}], set for polygon zones only
  child_phone: 'TEXT',
  at_place_id: 'INTEGER', // the place the scooter was last seen at; no foreign key, places can be deleted
};
const ADDED_EVENT_COLUMNS: Record<string, string> = {
  acknowledged_at: 'INTEGER',
  acknowledged_by: 'TEXT',
  place_name: 'TEXT',
};

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** One device as stored. Times are epoch milliseconds. */
export interface DeviceRow {
  id: string;
  parentId: string;
  name: string;
  childName: string | null;
  childPhone: string | null;
  lastSeenAt: number | null;
  telemetry: Telemetry | null;
  conditions: Conditions;
  lastLocation: (Omit<LastLocation, 'at'> & { at: number }) | null;
  geofence: Geofence | null;
  /** The place the scooter was last seen at; null = none. */
  atPlaceId: number | null;
}

type Raw = Record<string, any>;

function toDevice(raw: Raw): DeviceRow {
  return {
    id: raw.id,
    parentId: raw.parent_id,
    name: raw.name,
    childName: raw.child_name ?? null,
    childPhone: raw.child_phone ?? null,
    lastSeenAt: raw.last_seen_at ?? null,
    telemetry: raw.telemetry ? JSON.parse(raw.telemetry) : null,
    conditions: raw.conditions ? { ...NO_CONDITIONS, ...JSON.parse(raw.conditions) } : { ...NO_CONDITIONS },
    lastLocation:
      raw.last_lat != null && raw.last_lon != null
        ? { latitude: raw.last_lat, longitude: raw.last_lon, at: raw.last_location_at }
        : null,
    geofence:
      raw.geofence_lat != null
        ? {
            latitude: raw.geofence_lat,
            longitude: raw.geofence_lon,
            radius_m: raw.geofence_radius_m,
            ...(raw.geofence_points
              ? { shape: 'polygon' as const, points: JSON.parse(raw.geofence_points) }
              : { shape: 'circle' as const }),
          }
        : null,
    atPlaceId: raw.at_place_id ?? null,
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
    acknowledged_at: raw.acknowledged_at != null ? new Date(raw.acknowledged_at).toISOString() : null,
    acknowledged_by: raw.acknowledged_by ?? null,
    ...(raw.place_name != null ? { place_name: raw.place_name } : {}),
  };
}

const toPlace = (raw: Raw): Place => ({
  id: raw.id,
  name: raw.name,
  latitude: raw.latitude,
  longitude: raw.longitude,
  radius_m: raw.radius_m,
});

export class Store {
  private db: DatabaseSync;

  /** Pass ':memory:' for tests. */
  constructor(filename: string) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    const existing = new Set((this.db.prepare('PRAGMA table_info(devices)').all() as Raw[]).map((c) => c.name));
    for (const [column, type] of Object.entries(ADDED_COLUMNS)) {
      if (!existing.has(column)) this.db.exec(`ALTER TABLE devices ADD COLUMN ${column} ${type}`);
    }
    const eventColumns = new Set((this.db.prepare('PRAGMA table_info(events)').all() as Raw[]).map((c) => c.name));
    for (const [column, type] of Object.entries(ADDED_EVENT_COLUMNS)) {
      if (!eventColumns.has(column)) this.db.exec(`ALTER TABLE events ADD COLUMN ${column} ${type}`);
    }
    this.db
      .prepare('INSERT OR IGNORE INTO parents (id, name) VALUES (?, ?)')
      .run(DEMO_PARENT_ID, 'Demo parent');
  }

  /**
   * Create the device, or refresh its key from env. Only the key hash is stored.
   * Names are set when the device is created; after that the parent's edits win.
   */
  seedDevice(
    device: { id: string; apiKey: string; name: string; childName?: string | null },
    parentId = DEMO_PARENT_ID,
  ): void {
    this.db
      .prepare(
        `INSERT INTO devices (id, parent_id, name, child_name, api_key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           api_key_hash = excluded.api_key_hash,
           child_name = COALESCE(devices.child_name, excluded.child_name)`,
      )
      .run(device.id, parentId, device.name, device.childName ?? null, hashKey(device.apiKey), Date.now());
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
        `UPDATE devices SET name = ?, child_name = ?, child_phone = ?, last_seen_at = ?, telemetry = ?, conditions = ?,
           last_lat = ?, last_lon = ?, last_location_at = ?,
           geofence_lat = ?, geofence_lon = ?, geofence_radius_m = ?, geofence_points = ?, at_place_id = ?
         WHERE id = ?`,
      )
      .run(
        device.name,
        device.childName,
        device.childPhone,
        device.lastSeenAt,
        device.telemetry ? JSON.stringify(device.telemetry) : null,
        JSON.stringify(device.conditions),
        device.lastLocation?.latitude ?? null,
        device.lastLocation?.longitude ?? null,
        device.lastLocation?.at ?? null,
        device.geofence?.latitude ?? null,
        device.geofence?.longitude ?? null,
        device.geofence?.radius_m ?? null,
        device.geofence?.shape === 'polygon' ? JSON.stringify(device.geofence.points) : null,
        device.atPlaceId,
        device.id,
      );
  }

  addEvent(event: Omit<SafetyEvent, 'id' | 'created_at'> & { created_at: number }): SafetyEvent {
    const result = this.db
      .prepare(
        `INSERT INTO events (device_id, type, severity, message, created_at, latitude, longitude, place_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.device_id,
        event.type,
        event.severity,
        event.message,
        event.created_at,
        event.latitude,
        event.longitude,
        event.place_name ?? null,
      );
    return {
      ...event,
      id: Number(result.lastInsertRowid),
      created_at: new Date(event.created_at).toISOString(),
      acknowledged_at: null,
      acknowledged_by: null,
    };
  }

  getEvent(eventId: number): SafetyEvent | null {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Raw | undefined;
    return row ? toEvent(row) : null;
  }

  /** Mark an event as seen. The first acknowledgement wins; later ones change nothing. */
  acknowledgeEvent(eventId: number, by: string | null, at: number): SafetyEvent | null {
    this.db
      .prepare('UPDATE events SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL')
      .run(at, by, eventId);
    return this.getEvent(eventId);
  }

  /** Newest first. `beforeId` pages further back. */
  listEvents(deviceId: string, limit: number, beforeId?: number): SafetyEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE device_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(deviceId, beforeId ?? Number.MAX_SAFE_INTEGER, limit);
    return (rows as Raw[]).map(toEvent);
  }

  listPlaces(deviceId: string): Place[] {
    const rows = this.db.prepare('SELECT * FROM places WHERE device_id = ? ORDER BY id').all(deviceId);
    return (rows as Raw[]).map(toPlace);
  }

  addPlace(deviceId: string, place: PlaceInput, at: number): Place {
    const result = this.db
      .prepare('INSERT INTO places (device_id, name, latitude, longitude, radius_m, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(deviceId, place.name, place.latitude, place.longitude, place.radius_m, at);
    return { id: Number(result.lastInsertRowid), ...place };
  }

  /** false = no such place on this device. */
  deletePlace(deviceId: string, placeId: number): boolean {
    const result = this.db.prepare('DELETE FROM places WHERE id = ? AND device_id = ?').run(placeId, deviceId);
    return Number(result.changes) > 0;
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
