import { EVENT_INFO, type AlertType, type DeviceState, type SafetyEventType } from '@helmetto/shared';
import type { IconName } from './icons';

export type Tone = 'ok' | 'danger' | 'warn' | 'muted';

export const EVENT_ICON: Record<SafetyEventType, IconName> = {
  helmet_disconnected: 'helmet',
  helmet_reconnected: 'helmet',
  helmet_not_worn: 'helmet',
  helmet_worn: 'helmet',
  crash_detected: 'alert',
  crash_cleared: 'check',
  geofence_exit: 'zone',
  geofence_enter: 'zone',
  scooter_offline: 'signalOff',
  scooter_online: 'signal',
};

/** What the parent should do / understand, per active alert. */
export const ALERT_ADVICE: Record<AlertType, string> = {
  crash_detected: 'The scooter reported a crash. Call or check on the rider now.',
  helmet_disconnected: 'The scooter is on but it cannot hear the helmet. The helmet is out of range or switched off.',
  helmet_not_worn: 'The helmet is near the scooter but is not being worn.',
  geofence_exit: 'The scooter is outside the safe zone you set.',
  scooter_offline: 'No data from the scooter. It may be switched off or out of WiFi range. Helmet status is unknown.',
};

export const title = (type: SafetyEventType) => EVENT_INFO[type].title;

/** The scooter has reported at least once. */
export const hasReported = (device: DeviceState) => device.last_seen_at !== null;

/** Alerts about the ride itself (everything except the scooter being offline). */
export const rideAlerts = (device: DeviceState) =>
  device.active_alerts.filter((a) => a !== 'scooter_offline');

export interface Summary {
  tone: Tone;
  icon: IconName;
  title: string;
  detail: string;
}

/** One-line verdict for the dashboard hero and the device list. */
export function summarize(device: DeviceState): Summary {
  if (!hasReported(device)) {
    return {
      tone: 'muted',
      icon: 'clock',
      title: 'Waiting for scooter',
      detail: 'No data received yet. Switch the scooter on to start monitoring.',
    };
  }
  if (!device.online) {
    return {
      tone: 'muted',
      icon: 'signalOff',
      title: 'Scooter offline',
      detail: 'Not sending data. It is probably switched off or out of range. Values below are the last known.',
    };
  }
  const alerts = rideAlerts(device);
  const first = alerts[0];
  if (first) {
    return {
      tone: 'danger',
      icon: EVENT_ICON[first],
      title: title(first),
      detail: alerts.length > 1 ? `And ${alerts.length - 1} more active alert${alerts.length > 2 ? 's' : ''}.` : ALERT_ADVICE[first],
    };
  }
  const t = device.telemetry;
  const riding = t?.speed_kmh != null && t.speed_kmh > 1;
  return {
    tone: 'ok',
    icon: 'check',
    title: 'All good',
    detail: `Helmet connected${riding ? `, riding at ${Math.round(t!.speed_kmh!)} km/h` : ''}. No active alerts.`,
  };
}
