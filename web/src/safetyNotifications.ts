import { useEffect, useRef } from 'react';
import { zoneDepthMeters } from '@helmetto/ai';
import type { DeviceState } from '@helmetto/shared';
import { showNotification } from './notify';
import { childName, location } from './status';

/** Faster than this counts as riding, not pushing the scooter along or GPS jitter. */
export const RIDING_KMH = 3;

interface Flags {
  /** Moving while the helmet is off or out of range. */
  ridingWithoutHelmet: boolean;
  outsideZone: boolean;
  crash: boolean;
}

function flags(d: DeviceState): Flags {
  const live = d.online;
  const moving = (d.telemetry?.speed_kmh ?? 0) >= RIDING_KMH;
  const helmetOff = d.active_alerts.includes('helmet_disconnected') || d.active_alerts.includes('helmet_not_worn');
  return {
    ridingWithoutHelmet: live && moving && helmetOff,
    outsideZone: live && d.active_alerts.includes('geofence_exit'),
    crash: d.active_alerts.includes('crash_detected'),
  };
}

/** Roughly how far outside the safe zone, rounded for reading; null when unknown. */
function metersOutside(d: DeviceState): number | null {
  const { position } = location(d);
  if (!position) return null;
  const depth = zoneDepthMeters(d.geofence, { lat: position.latitude, lon: position.longitude });
  if (depth === null || depth >= 0) return null;
  return -depth < 100 ? Math.max(5, Math.round(-depth / 5) * 5) : Math.round(-depth / 10) * 10;
}

function notifyFor(d: DeviceState, kind: keyof Flags) {
  const name = childName(d) ?? 'The rider';
  const speed = Math.round(d.telemetry?.speed_kmh ?? 0);
  switch (kind) {
    case 'ridingWithoutHelmet':
      return showNotification(
        `${name} is riding without a helmet`,
        d.active_alerts.includes('helmet_disconnected')
          ? `The scooter can't find the helmet. Moving at ${speed} km/h.`
          : `The helmet is off. Moving at ${speed} km/h.`,
        `${d.device_id}:helmet`,
      );
    case 'outsideZone': {
      const far = metersOutside(d);
      return showNotification(
        `${name} left the safe zone`,
        far ? `About ${far} m outside the zone you drew.` : 'Outside the zone you drew on the map.',
        `${d.device_id}:zone`,
      );
    }
    case 'crash':
      return showNotification(`${name} may have crashed`, `Check on ${name} now. Open Helmetto for the crash plan.`, `${d.device_id}:crash`);
  }
}

/**
 * Notifies when a situation starts: riding without a helmet, leaving the
 * safe zone, a crash. Not again while it lasts, and not for what was already
 * true when the app opened (the screen shows that).
 */
export function useSafetyNotifications(devices: DeviceState[], loaded: boolean) {
  const previous = useRef<Record<string, Flags> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const next = Object.fromEntries(devices.map((d) => [d.device_id, flags(d)]));
    const before = previous.current;
    previous.current = next;
    if (!before) return;
    for (const d of devices) {
      const was = before[d.device_id];
      const now = next[d.device_id]!;
      if (!was) continue;
      for (const kind of ['crash', 'ridingWithoutHelmet', 'outsideZone'] as const) {
        if (now[kind] && !was[kind]) void notifyFor(d, kind);
      }
    }
  }, [devices, loaded]);
}
