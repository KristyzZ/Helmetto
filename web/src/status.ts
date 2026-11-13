import {
  EQUIPMENT_INFO,
  EVENT_INFO,
  GEAR_INFO,
  type AlertType,
  type DeviceState,
  type EquipmentKind,
  type GearState,
  type GearStatus,
  type GearType,
  type SafetyEvent,
  type SafetyEventType,
} from '@helmetto/shared';
import type { IconName } from './icons';
import { ago, duration } from './time';

/** The only colours in the app: green ok, amber warning, red alert, grey unknown/idle. */
export type Tone = 'ok' | 'warn' | 'alert' | 'unknown';

export const EVENT_ICON: Record<SafetyEventType, IconName> = {
  unprotected_use: 'shield',
  protection_restored: 'check',
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

export const KIND_ICON: Record<EquipmentKind, IconName> = {
  power_tool: 'grinder',
  chainsaw: 'chainsaw',
  boat: 'boat',
  scooter: 'scooter',
  other: 'shield',
};

export const GEAR_ICON: Record<GearType, IconName> = {
  helmet: 'helmet',
  eye_protection: 'goggles',
  ear_protection: 'ears',
  gloves: 'gloves',
  chaps: 'chaps',
  life_jacket: 'vest',
};

export const title = (type: SafetyEventType) => EVENT_INFO[type].title;
export const alertTone = (type: AlertType): Tone => (type === 'scooter_offline' ? 'warn' : 'alert');

export const kindOf = (d: DeviceState): EquipmentKind => d.kind ?? 'other';
export const kindInfo = (d: DeviceState) => EQUIPMENT_INFO[kindOf(d)];
export const operatorOf = (d: DeviceState) => (d.operator_name ?? d.child_name)?.trim() || null;
export const hasReported = (d: DeviceState) => d.last_seen_at !== null;
export const requiredGear = (d: DeviceState): GearType[] => d.required_gear ?? [...kindInfo(d).defaultGear];
export const gearStatuses = (d: DeviceState): GearStatus[] =>
  d.gear_status ?? requiredGear(d).map((type) => ({ type, state: 'unknown' as GearState }));
export const unsafeGear = (d: DeviceState): GearType[] =>
  gearStatuses(d).filter((g) => g.state === 'missing' || g.state === 'not_worn').map((g) => g.type);

/** "Mantas · Pavilniai forest" */
export function subtitle(d: DeviceState): string {
  return [operatorOf(d), d.site].filter(Boolean).join(' · ') || kindInfo(d).label;
}

/** The longer explanation, shown only in the details sheet. */
export const ALERT_HELP: Record<AlertType, string> = {
  unprotected_use:
    'The equipment is in use while required protective gear is missing or not worn. With auto-lock on, the equipment is told to stay locked until the gear is back.',
  crash_detected: 'The equipment reported a hard impact. Check on the operator now.',
  geofence_exit: 'The equipment is outside the work area set on the map.',
  scooter_offline:
    'The equipment stopped sending data. It may be switched off or out of WiFi range. Gear status is unknown until it reconnects.',
  helmet_disconnected: 'The helmet tag is out of range.',
  helmet_not_worn: 'The helmet is nearby but not worn.',
};

/** Most urgent first. */
const PRIORITY: AlertType[] = ['crash_detected', 'unprotected_use', 'helmet_disconnected', 'helmet_not_worn', 'geofence_exit'];

/** Alerts worth showing. While offline everything else is unknown, so "offline" is the only one. */
export function visibleAlerts(d: DeviceState): AlertType[] {
  if (!hasReported(d)) return [];
  if (!d.online) return ['scooter_offline'];
  return PRIORITY.filter((type) => d.active_alerts.includes(type));
}

/** "No chaps", "Life jacket not worn", "No safety glasses, gloves" */
export function gearProblem(d: DeviceState): string {
  const bad = gearStatuses(d).filter((g) => g.state === 'missing' || g.state === 'not_worn');
  if (bad.length === 1 && bad[0]!.state === 'not_worn') return `${GEAR_INFO[bad[0]!.type].label} not worn`;
  if (bad.length === 0) return 'Gear missing';
  const names = bad.map((g) => GEAR_INFO[g.type].short);
  const list = names.join(', ');
  return `No ${list}`;
}

/** One short line under an alert title. */
export function alertLine(type: AlertType, d: DeviceState): string {
  switch (type) {
    case 'unprotected_use':
      return gearProblem(d) + (d.lock_engaged ? ' · locked' : '');
    case 'crash_detected':
      return `Check on ${operatorOf(d) ?? 'the operator'} now`;
    case 'geofence_exit':
      return 'Outside the work area';
    case 'scooter_offline':
      return 'Not sending data';
    case 'helmet_disconnected':
      return 'Helmet out of range';
    case 'helmet_not_worn':
      return 'Helmet not worn';
  }
}

export interface Status {
  tone: Tone;
  label: string;
  icon: IconName;
}

/** One-word state for cards and pills. */
export function deviceStatus(d: DeviceState): Status {
  const info = kindInfo(d);
  if (!hasReported(d)) return { tone: 'unknown', label: 'Not connected', icon: 'clock' };
  if (!d.online) return { tone: 'warn', label: 'Offline', icon: 'signalOff' };
  const top = visibleAlerts(d)[0];
  if (top === 'unprotected_use' && d.lock_engaged) return { tone: 'alert', label: 'Locked', icon: 'lock' };
  if (top) return { tone: 'alert', label: title(top), icon: EVENT_ICON[top] };
  if (d.manual_lock) return { tone: 'warn', label: 'Locked', icon: 'lock' };
  if (d.in_use) return { tone: 'ok', label: info.inUse, icon: 'check' };
  return { tone: 'unknown', label: info.idle, icon: 'power' };
}

export interface Hero {
  tone: Tone;
  icon: IconName;
  title: string;
  line: string;
  alert: AlertType | null;
  help: string;
}

/** The single most important thing about one piece of equipment. */
export function hero(d: DeviceState, serverNow: number): Hero {
  const info = kindInfo(d);
  const who = operatorOf(d);
  if (!hasReported(d)) {
    return {
      tone: 'unknown', icon: 'clock', title: 'Not connected', line: 'No data yet', alert: null,
      help: 'This equipment has not sent any data yet. Switch it on within WiFi range.',
    };
  }
  const top = visibleAlerts(d)[0];
  if (top === 'scooter_offline') {
    return {
      tone: 'warn', icon: 'signalOff', title: 'Offline', line: `Last seen ${ago(d.last_seen_at, serverNow)}`,
      alert: top, help: ALERT_HELP[top],
    };
  }
  if (top) {
    const lockedTitle = top === 'unprotected_use' && d.lock_engaged;
    return {
      tone: 'alert',
      icon: lockedTitle ? 'lock' : EVENT_ICON[top],
      title: lockedTitle ? 'Locked: no protection' : title(top),
      line: top === 'unprotected_use' ? `${gearProblem(d)}${who ? ` · ${who}` : ''}` : alertLine(top, d),
      alert: top,
      help: ALERT_HELP[top],
    };
  }
  if (d.manual_lock) {
    return {
      tone: 'warn', icon: 'lock', title: 'Locked remotely', line: 'Locked from the app', alert: null,
      help: 'A manager locked this equipment from the app. It stays locked until someone unlocks it here.',
    };
  }
  if (d.in_use) {
    const unknown = gearStatuses(d).some((g) => g.state === 'unknown');
    return {
      tone: 'ok',
      icon: 'check',
      title: 'Protected',
      line: `${who ?? info.label} · ${info.inUse.toLowerCase()}${unknown ? '' : ' with all gear'}`,
      alert: null,
      help: unknown
        ? 'In use and all tagged gear is on. Some required gear has no tag, so Helmetto cannot check it.'
        : 'In use and every piece of required gear is on.',
    };
  }
  return {
    tone: 'unknown', icon: 'power', title: info.idle, line: 'Not in use', alert: null,
    help: 'The equipment is not in use. Gear is only checked while it is in use.',
  };
}

/** One tile per required gear item. */
export function gearTiles(d: DeviceState): { type: GearType; label: string; value: string; tone: Tone }[] {
  const live = d.online;
  const active = d.in_use || d.lock_engaged;
  return gearStatuses(d).map(({ type, state }) => {
    const label = GEAR_INFO[type].label;
    if (!live) return { type, label, value: 'Unknown', tone: 'unknown' };
    switch (state) {
      case 'ok':
        return { type, label, value: 'On', tone: 'ok' };
      case 'missing':
        return { type, label, value: active ? 'Missing' : 'Not here', tone: active ? 'alert' : 'unknown' };
      case 'not_worn':
        return { type, label, value: 'Not worn', tone: active ? 'alert' : 'unknown' };
      default:
        return { type, label, value: 'No tag', tone: 'unknown' };
    }
  });
}

export interface Chip {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  tone: Tone;
  help: string;
}

/** Glanceable facts about the equipment itself. */
export function chips(d: DeviceState, serverNow: number): Chip[] {
  const t = d.telemetry;
  const info = kindInfo(d);
  const live = d.online;
  const out: Chip[] = [];

  out.push(
    !hasReported(d)
      ? { key: 'state', icon: 'power', label: 'State', value: '—', tone: 'unknown', help: 'No data yet.' }
      : !live
        ? { key: 'state', icon: 'signalOff', label: 'State', value: 'Offline', tone: 'warn', help: `No data for ${duration(d.last_seen_at, serverNow)}.` }
        : d.in_use
          ? { key: 'state', icon: 'power', label: 'State', value: info.inUse, tone: 'ok', help: `${info.label} is in use. Updated ${ago(d.last_seen_at, serverNow)}.` }
          : { key: 'state', icon: 'power', label: 'State', value: info.idle, tone: 'unknown', help: `${info.label} is not in use.` },
  );

  out.push(
    d.manual_lock
      ? { key: 'lock', icon: 'lock', label: 'Lock', value: 'Locked', tone: 'warn', help: 'Locked from the app. Use Unlock on this page to release it.' }
      : !d.auto_lock
      ? { key: 'lock', icon: 'unlock', label: 'Auto-lock', value: 'Off', tone: 'unknown', help: 'Auto-lock is off: Helmetto only alerts. Turn it on in settings if the equipment has lock hardware.' }
      : d.lock_engaged
        ? { key: 'lock', icon: 'lock', label: 'Auto-lock', value: 'Locked', tone: 'alert', help: 'Locked because required gear is missing. It unlocks as soon as the gear is back.' }
        : { key: 'lock', icon: 'lock', label: 'Auto-lock', value: 'Ready', tone: 'ok', help: 'Auto-lock is on. The equipment locks if required gear goes missing.' },
  );

  if (t?.speed_kmh != null || kindOf(d) === 'boat' || kindOf(d) === 'scooter') {
    out.push(
      !live || t?.speed_kmh == null
        ? { key: 'speed', icon: 'gauge', label: 'Speed', value: '—', tone: 'unknown', help: 'Speed unknown.' }
        : { key: 'speed', icon: 'gauge', label: 'Speed', value: `${Math.round(t.speed_kmh)} km/h`, tone: 'ok', help: `Moving at ${Math.round(t.speed_kmh)} km/h.` },
    );
  }

  const level = t?.battery_percent;
  out.push(
    level == null
      ? { key: 'battery', icon: 'battery', label: 'Battery', value: '—', tone: 'unknown', help: 'This device does not report its battery level.' }
      : {
          key: 'battery', icon: 'battery', label: 'Battery', value: `${Math.round(level)}%`,
          tone: !live ? 'unknown' : level < 20 ? 'warn' : 'ok',
          help: !live ? `Last known level, from ${ago(d.last_seen_at, serverNow)}.` : level < 20 ? 'Battery is low.' : 'Battery level of the tag on the equipment.',
        },
  );
  return out;
}

/** The event that started an active alert: its newest occurrence. */
export function activeEvent(events: readonly SafetyEvent[], type: AlertType): SafetyEvent | null {
  return events.find((e) => e.type === type) ?? null;
}

/** "45 s", "12 min", "3 h 20 min" */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function complianceTone(value: number | null): Tone {
  if (value === null) return 'unknown';
  return value >= 0.95 ? 'ok' : value >= 0.8 ? 'warn' : 'alert';
}

/** Current GPS position, or the last known one. */
export function location(d: DeviceState) {
  const t = d.telemetry;
  const hasGps = t?.latitude != null && t.longitude != null;
  const position = hasGps ? { latitude: t.latitude!, longitude: t.longitude! } : d.last_location;
  return { position, live: hasGps && d.online };
}

export function locationLabel(d: DeviceState, serverNow: number): string {
  const { position, live } = location(d);
  if (!position) return 'No location';
  return live ? 'Live location' : `Last seen here ${ago(d.last_location?.at ?? null, serverNow)}`;
}

export function zoneLabel(d: DeviceState): { tone: Tone; text: string } {
  if (!d.geofence) return { tone: 'unknown', text: 'No work area' };
  if (!d.online) return { tone: 'unknown', text: 'Work area set' };
  if (d.active_alerts.includes('geofence_exit')) return { tone: 'alert', text: 'Outside work area' };
  if (d.zone_status === 'inside') return { tone: 'ok', text: 'In work area' };
  return { tone: 'unknown', text: 'Work area set' };
}

/** Devices that need attention, most urgent first: alerts, then offline. */
export function attention(devices: DeviceState[]): { device: DeviceState; alert: AlertType }[] {
  const rank = (a: AlertType) => (a === 'scooter_offline' ? 10 : PRIORITY.indexOf(a));
  return devices
    .flatMap((device) => {
      const top = visibleAlerts(device)[0];
      return top ? [{ device, alert: top }] : [];
    })
    .sort((a, b) => rank(a.alert) - rank(b.alert));
}

export interface FleetHero {
  tone: Tone;
  icon: IconName;
  title: string;
  line: string;
  deviceId: string | null;
  more: number;
}

/** The single most important thing across all equipment. */
export function fleetHero(devices: DeviceState[]): FleetHero {
  const urgent = attention(devices);
  const first = urgent[0];
  if (first) {
    const { device, alert } = first;
    const locked = alert === 'unprotected_use' && device.lock_engaged;
    const who = operatorOf(device);
    return {
      tone: alertTone(alert),
      icon: locked ? 'lock' : EVENT_ICON[alert],
      title: locked ? 'Locked: no protection' : title(alert),
      line: `${device.name} · ${alert === 'unprotected_use' ? gearProblem(device) : who ?? alertLine(alert, device)}`,
      deviceId: device.device_id,
      more: urgent.length - 1,
    };
  }
  const reported = devices.filter(hasReported);
  if (reported.length === 0) {
    return { tone: 'unknown', icon: 'clock', title: 'Waiting for equipment', line: 'No data yet', deviceId: null, more: 0 };
  }
  const inUse = reported.filter((d) => d.in_use).length;
  const idle = reported.length - inUse;
  const parts = [inUse ? `${inUse} in use` : null, idle ? `${idle} not in use` : null].filter(Boolean);
  return { tone: 'ok', icon: 'check', title: 'All protected', line: parts.join(' · '), deviceId: null, more: 0 };
}
