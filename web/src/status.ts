import { EVENT_INFO, type AlertType, type DeviceState, type SafetyEvent, type SafetyEventType } from '@helmetto/shared';
import type { IconName } from './icons';
import { ago, duration } from './time';

/** The only colours in the app: green ok, amber warning, red alert, grey unknown. */
export type Tone = 'ok' | 'warn' | 'alert' | 'unknown';

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

export const title = (type: SafetyEventType) => EVENT_INFO[type].title;
export const alertTone = (type: AlertType): Tone => (type === 'scooter_offline' ? 'warn' : 'alert');

/** The longer explanation, shown only in the details sheet. */
export const ALERT_HELP: Record<AlertType, string> = {
  crash_detected: 'The scooter reported a crash. Call or go and check on the rider now.',
  helmet_disconnected:
    'The scooter is on but cannot hear the helmet, so the helmet is out of range or switched off. The rider is probably not wearing it.',
  helmet_not_worn: 'The helmet is close to the scooter but its sensor says it is not on the head.',
  geofence_exit: 'The scooter is outside the safe zone you drew on the map.',
  scooter_offline:
    'The scooter stopped sending data. It is probably switched off or out of WiFi range. Helmet and location are unknown until it reconnects.',
};

/** Most urgent first. */
const PRIORITY: AlertType[] = ['crash_detected', 'helmet_disconnected', 'helmet_not_worn', 'geofence_exit'];

export const childName = (device: DeviceState) => device.child_name?.trim() || null;
/** What to call this scooter in the UI: the child, else the scooter's own name. */
export const displayName = (device: DeviceState) => childName(device) ?? device.name;
export const hasReported = (device: DeviceState) => device.last_seen_at !== null;

/**
 * Alerts worth showing right now. While the scooter is offline everything else
 * is unknown, so "offline" is the only one.
 */
export function visibleAlerts(device: DeviceState): AlertType[] {
  if (!hasReported(device)) return [];
  if (!device.online) return ['scooter_offline'];
  return PRIORITY.filter((type) => device.active_alerts.includes(type));
}

/** One short line under an alert title. */
export function alertLine(type: AlertType, device: DeviceState): string {
  const name = childName(device);
  const riding = (device.telemetry?.speed_kmh ?? 0) > 1;
  switch (type) {
    case 'crash_detected':
      return name ? `Check on ${name} now` : 'Check on the rider now';
    case 'helmet_disconnected':
      return riding ? (name ? `${name} is riding without it` : 'Riding without it') : "Scooter can't find the helmet";
    case 'helmet_not_worn':
      return name ? `${name}'s helmet is off` : 'The helmet is off';
    case 'geofence_exit':
      return name ? `${name} is outside the zone` : 'Outside the zone';
    case 'scooter_offline':
      return 'Not sending data';
  }
}

export interface Hero {
  tone: Tone;
  icon: IconName;
  title: string;
  line: string;
  /** Set when the hero is showing an alert. */
  alert: AlertType | null;
  help: string;
}

/** The single most important thing to know about this scooter. */
export function hero(device: DeviceState, serverNow: number): Hero {
  const name = childName(device);
  if (!hasReported(device)) {
    return {
      tone: 'unknown',
      icon: 'clock',
      title: 'Waiting for scooter',
      line: 'No data yet',
      alert: null,
      help: 'This scooter has not sent any data yet. Switch it on within WiFi range to start monitoring.',
    };
  }
  const top = visibleAlerts(device)[0];
  if (top === 'scooter_offline') {
    return {
      tone: 'warn',
      icon: 'signalOff',
      title: 'Scooter offline',
      line: `Last seen ${ago(device.last_seen_at, serverNow)}`,
      alert: top,
      help: ALERT_HELP[top],
    };
  }
  if (top) {
    return { tone: 'alert', icon: EVENT_ICON[top], title: title(top), line: alertLine(top, device), alert: top, help: ALERT_HELP[top] };
  }
  const t = device.telemetry;
  const riding = (t?.speed_kmh ?? 0) > 1;
  const worn = t?.helmet_worn === true;
  const line = riding
    ? `${name ?? 'Rider'} is riding${worn ? ' with helmet on' : ', helmet connected'}`
    : name
      ? `${name}'s helmet is ${worn ? 'on' : 'connected'}`
      : `Helmet ${worn ? 'on' : 'connected'}`;
  return {
    tone: 'ok',
    icon: 'check',
    title: 'All good',
    line,
    alert: null,
    help: worn
      ? 'The scooter is online, the helmet is being worn and there are no active alerts.'
      : 'The scooter is online and can hear the helmet. There are no active alerts.',
  };
}

export interface Chip {
  key: 'scooter' | 'helmet' | 'speed' | 'battery';
  icon: IconName;
  label: string;
  value: string;
  tone: Tone;
  help: string;
}

/** The four glanceable facts under the hero. Explanations live in `help`. */
export function chips(device: DeviceState, serverNow: number): Chip[] {
  const t = device.telemetry;
  const live = device.online;
  const reported = hasReported(device);

  const scooter: Chip = !reported
    ? { key: 'scooter', icon: 'scooter', label: 'Scooter', value: '—', tone: 'unknown', help: 'This scooter has not sent any data yet.' }
    : live
      ? { key: 'scooter', icon: 'signal', label: 'Scooter', value: 'Online', tone: 'ok', help: `Sending data. Last update ${ago(device.last_seen_at, serverNow)}.` }
      : { key: 'scooter', icon: 'signalOff', label: 'Scooter', value: 'Offline', tone: 'warn', help: `No data for ${duration(device.last_seen_at, serverNow)}. It is probably switched off or out of WiFi range.` };

  let helmet: Chip;
  if (!t || !live) {
    helmet = {
      key: 'helmet', icon: 'helmet', label: 'Helmet', value: 'Unknown', tone: 'unknown',
      help: t
        ? `Unknown while the scooter is offline. It was ${t.helmet_connected ? 'connected' : 'disconnected'} when the scooter was last heard.`
        : 'Unknown until the scooter sends data.',
    };
  } else if (!t.helmet_connected) {
    helmet = { key: 'helmet', icon: 'helmet', label: 'Helmet', value: 'No signal', tone: 'alert', help: ALERT_HELP.helmet_disconnected };
  } else if (t.helmet_worn === false) {
    helmet = { key: 'helmet', icon: 'helmet', label: 'Helmet', value: 'Not worn', tone: 'alert', help: ALERT_HELP.helmet_not_worn };
  } else if (t.helmet_worn === true) {
    helmet = { key: 'helmet', icon: 'helmet', label: 'Helmet', value: 'On', tone: 'ok', help: 'The helmet is connected and being worn.' };
  } else {
    helmet = {
      key: 'helmet', icon: 'helmet', label: 'Helmet', value: 'Connected', tone: 'ok',
      help: 'The scooter can hear the helmet. This helmet has no wearing sensor, so Helmetto cannot tell whether it is on the head.',
    };
  }

  const speed: Chip =
    !live || t?.speed_kmh == null
      ? {
          key: 'speed', icon: 'gauge', label: 'Speed', value: '—', tone: 'unknown',
          help: live ? 'This scooter does not report its speed yet.' : 'Unknown while the scooter is offline.',
        }
      : { key: 'speed', icon: 'gauge', label: 'Speed', value: `${Math.round(t.speed_kmh)} km/h`, tone: 'ok', help: `Riding at ${Math.round(t.speed_kmh)} km/h.` };

  const level = t?.battery_percent;
  const battery: Chip =
    level == null
      ? { key: 'battery', icon: 'battery', label: 'Battery', value: '—', tone: 'unknown', help: 'This scooter does not report its battery level yet.' }
      : {
          key: 'battery', icon: 'battery', label: 'Battery', value: `${Math.round(level)}%`,
          tone: !live ? 'unknown' : level < 20 ? 'warn' : 'ok',
          help: !live ? `Last known level, from ${ago(device.last_seen_at, serverNow)}.` : level < 20 ? 'Battery is low.' : 'Scooter battery level.',
        };

  return [scooter, helmet, speed, battery];
}

/** Current GPS position, or the last known one when there is no fix. */
export function location(device: DeviceState) {
  const t = device.telemetry;
  const hasGps = t?.latitude != null && t.longitude != null;
  const position = hasGps ? { latitude: t.latitude!, longitude: t.longitude! } : device.last_location;
  return { position, live: hasGps && device.online };
}

export function locationLabel(device: DeviceState, serverNow: number): string {
  const { position, live } = location(device);
  if (!position) return 'No location yet';
  return live ? 'Live location' : `Last seen here ${ago(device.last_location?.at ?? null, serverNow)}`;
}

export function zoneLabel(device: DeviceState): { tone: Tone; text: string } {
  if (!device.geofence) return { tone: 'unknown', text: 'No safe zone' };
  if (!device.online) return { tone: 'unknown', text: 'Safe zone set' };
  if (device.active_alerts.includes('geofence_exit')) return { tone: 'alert', text: 'Outside safe zone' };
  if (device.zone_status === 'inside') return { tone: 'ok', text: 'In safe zone' };
  return { tone: 'unknown', text: 'Safe zone set' };
}

export interface Check {
  key: 'helmet' | 'crash' | 'zone' | 'scooter';
  icon: IconName;
  label: string;
  value: string;
  tone: Tone;
  help: string;
}

/**
 * The four safety questions a parent has, answered in one word each.
 * Shown inside the hero so the whole situation reads at a glance.
 */
export function checks(device: DeviceState, serverNow: number): Check[] {
  const [scooterChip, helmetChip] = chips(device, serverNow) as [Chip, Chip];
  const reported = hasReported(device);
  const live = device.online;
  const crashed = live && device.active_alerts.includes('crash_detected');
  const crash: Check = !reported || !live
    ? { key: 'crash', icon: 'shield', label: 'Crash', value: 'Unknown', tone: 'unknown', help: 'Crash detection works while the scooter is online.' }
    : crashed
      ? { key: 'crash', icon: 'alert', label: 'Crash', value: 'Detected', tone: 'alert', help: ALERT_HELP.crash_detected }
      : { key: 'crash', icon: 'shield', label: 'Crash', value: 'None', tone: 'ok', help: 'No crash detected. The scooter watches for sudden impacts and falls.' };
  const z = zoneLabel(device);
  const zone: Check = {
    key: 'zone', icon: 'zone', label: 'Zone',
    value: z.tone === 'alert' ? 'Outside' : z.tone === 'ok' ? 'Inside' : device.geofence ? 'Unknown' : 'Not set',
    tone: z.tone,
    help: z.tone === 'alert'
      ? ALERT_HELP.geofence_exit
      : z.tone === 'ok'
        ? 'The scooter is inside the safe zone you drew on the map.'
        : device.geofence
          ? 'Zone status is unknown until the scooter reports its location.'
          : 'Draw a safe zone on the map to get an alert when the scooter leaves it.',
  };
  return [
    { ...helmetChip, key: 'helmet' },
    crash,
    zone,
    { ...scooterChip, key: 'scooter', label: 'Scooter', value: scooterChip.value === '—' ? 'Unknown' : scooterChip.value },
  ];
}

export interface DayCount {
  /** Midnight of the day, local time. */
  start: number;
  label: string;
  count: number;
  today: boolean;
}

export interface Stats {
  days: DayCount[];
  week: number;
  today: number;
  /** Most frequent alert type this week. */
  top: SafetyEventType | null;
  /** ISO time of the newest alert, if any. */
  lastAlertAt: string | null;
}

/** Alert counts for the last seven days, oldest first. */
export function stats(events: SafetyEvent[], serverNow: number): Stats {
  const midnight = new Date(serverNow);
  midnight.setHours(0, 0, 0, 0);
  const days: DayCount[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(midnight);
    d.setDate(d.getDate() - i);
    days.push({
      start: d.getTime(),
      label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      count: 0,
      today: i === 0,
    });
  }
  const counts = new Map<SafetyEventType, number>();
  let lastAlertAt: string | null = null;
  for (const e of events) {
    if (e.severity !== 'alert') continue;
    lastAlertAt ??= e.created_at;
    const at = Date.parse(e.created_at);
    for (let i = days.length - 1; i >= 0; i--) {
      if (at >= days[i]!.start) {
        days[i]!.count++;
        counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
        break;
      }
    }
  }
  let top: SafetyEventType | null = null;
  for (const [type, n] of counts) if (!top || n > counts.get(top)!) top = type;
  const week = days.reduce((sum, d) => sum + d.count, 0);
  return { days, week, today: days[6]!.count, top, lastAlertAt };
}

/** "Good morning" etc., by the viewer's local time. */
export function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
