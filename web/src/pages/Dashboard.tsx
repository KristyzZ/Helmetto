import { useEffect, useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { CrashPlan, crashToHandle } from '../CrashPlan';
import { NotifyPrompt } from '../NotifyPrompt';
import { MapView } from '../MapView';
import { Sheet } from '../Sheet';
import {
  ALERT_HELP,
  EVENT_ICON,
  alertTone,
  childName,
  chips,
  hasReported,
  hero,
  location,
  locationLabel,
  title,
  visibleAlerts,
  zoneLabel,
  type Chip,
} from '../status';
import { ago, clock, dayLabel, duration } from '../time';

type Detail = { kind: 'hero' } | { kind: 'alert'; type: AlertType } | { kind: 'chip'; chip: Chip['key'] };

const TODAY_MAX = 5;
const ZONE_VALUE: Record<string, string> = {
  'No safe zone': 'Not set',
  'Safe zone set': 'Set',
  'In safe zone': 'Inside',
  'Outside safe zone': 'Outside',
};

/**
 * Home: where the child is (the map, first), whether they're safe (the name
 * sticker), the facts in words, and what happened today.
 */
export function Dashboard(props: {
  device: DeviceState;
  events: SafetyEvent[];
  serverNow: number;
  onOpenMap: () => void;
  onOpenAlerts: () => void;
  onAcknowledged: (event: SafetyEvent) => void;
  onSaved: (state: DeviceState) => void;
  /**
   * Set while the server can't be reached. `since` = when the status on screen
   * was saved on this phone (null = nothing saved); `server` = the address the
   * iOS app is trying, to spot a wrong build.
   */
  offline?: { since: string | null; server: string | null } | null;
}) {
  const { device, events, serverNow, offline } = props;
  const [detail, setDetail] = useState<Detail | null>(null);
  // Demo server: the scooter is simulated, so the setup guide would only confuse. null = not known yet.
  const [demo, setDemo] = useState<boolean | null>(null);
  const waiting = !hasReported(device) && device.device_id !== 'offline';
  useEffect(() => {
    if (!waiting || demo !== null) return;
    api.demoStatus().then((s) => setDemo(s.enabled), () => {});
  }, [waiting, demo]);

  const facts = chips(device, serverNow);
  const { position, live } = location(device);
  const zone = zoneLabel(device);
  const today = events.filter((e) => dayLabel(e.created_at) === 'Today').slice(0, TODAY_MAX);
  const name = childName(device) ?? device.name;
  const crash = crashToHandle(device, events, serverNow);
  // An impact is reported for a moment only: until someone is on it, keep the sticker red.
  const base = hero(device, serverNow);
  // Only stand in for a calm state: an active alert or "offline" is more current and stays visible.
  // Once the scooter is riding again, the sticker shows that; the plan below still asks to check.
  const ridingAgain = device.online && (device.telemetry?.speed_kmh ?? 0) > 1;
  const crashOpen = !!crash && !crash.acknowledged_at && base.alert === null && !ridingAgain;
  const neverConnected = device.device_id === 'offline';
  const summary = offline
    ? {
        ...base,
        tone: 'unknown' as const,
        icon: 'signalOff' as const,
        title: neverConnected ? 'Not connected' : "Can't reach Helmetto",
        line: neverConnected
          ? "Helmetto can't reach its server yet. Check the internet connection; it keeps trying."
          : `Showing the last known status${offline.since ? ` from ${clock(offline.since)}` : ''}. It updates as soon as the connection is back.`,
        alert: null,
        help: neverConnected
          ? "This phone hasn't reached the Helmetto server yet, so there's no scooter status to show. It keeps trying by itself."
          : "The phone can't reach the Helmetto server right now, so this is the status from the last time it could. It updates by itself when the connection is back.",
      }
    : crashOpen
    ? {
        ...base,
        tone: 'alert' as const,
        icon: 'alert' as const,
        title: 'Possible crash',
        line: `Reported at ${clock(crash.created_at)}. Check on ${childName(device) ?? 'the rider'}.`,
        alert: 'crash_detected' as const,
        help: ALERT_HELP.crash_detected,
      }
    : base;
  const others = visibleAlerts(device).filter((type) => type !== summary.alert);

  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;
  const openChip = detail?.kind === 'chip' ? facts.find((c) => c.key === detail.chip) : undefined;
  const openAlert = detail?.kind === 'alert' ? detail.type : detail?.kind === 'hero' ? summary.alert : null;

  if (!hasReported(device)) {
    return (
      <div className="home home--empty">
        <div className="empty-state">
          <span className="empty-state__icon"><Icon name={neverConnected ? 'signalOff' : 'scooter'} size={40} /></span>
          {neverConnected ? (
            <>
              <h2>{summary.title}</h2>
              <p>{summary.line}</p>
            </>
          ) : (
            <>
              <h2>Waiting for the scooter</h2>
              <p>{`${childName(device) ? `${childName(device)}'s` : 'The'} helmet and location show here as soon as the scooter sends its first update.`}</p>
            </>
          )}
          {(neverConnected || demo === false) && (
            <button className="button button--primary" onClick={() => setDetail({ kind: 'hero' })}>
              {neverConnected ? 'What to check' : 'How it connects'}
            </button>
          )}
          {offline?.server && <p className="home__server">Server: {offline.server}</p>}
        </div>
        {detail?.kind === 'hero' && (
          <Sheet title={neverConnected ? 'What to check' : 'How it connects'} icon={summary.icon} tone={summary.tone} onClose={() => setDetail(null)}>
            {neverConnected ? (
              <ol className="steps">
                <li>Check that this phone has internet.</li>
                <li>For a test server on a Mac: the Mac and this phone are on the same Wi-Fi, and the server window is open.</li>
                <li>Helmetto keeps trying by itself; this screen updates as soon as it connects.</li>
              </ol>
            ) : (
              <ol className="steps">
                <li>Switch the scooter on. Its chip joins the 2.4 GHz Wi-Fi it was set up with; a phone's Personal Hotspot works too.</li>
                <li>Switch the helmet on. Its chip finds the scooter's chip by itself, with no pairing.</li>
                <li>The scooter sends an update every few seconds. This screen shows the helmet as soon as the first one arrives.</li>
              </ol>
            )}
          </Sheet>
        )}
      </div>
    );
  }

  return (
    <div className="home">
      <div className="home__map" onClick={props.onOpenMap}>
        {position ? (
          <MapView
            position={position}
            stale={!live || !!offline}
            alert={summary.tone === 'alert'}
            zone={device.geofence}
            zoneTone={zone.tone === 'warn' ? 'unknown' : zone.tone}
            follow
            interactive={false}
          />
        ) : (
          <span className="home__nomap"><Icon name="map" size={22} /> No location yet</span>
        )}
        <button className={`map-pill ${position && live && !offline ? 'map-pill--live' : ''}`} onClick={props.onOpenMap}>
          <i className={`dot tone-${position && live && !offline ? 'ok' : 'unknown'}`} />
          {!position ? 'Open map' : offline ? 'Last known location' : locationLabel(device, serverNow)}
          <Icon name="chevron" size={14} />
        </button>
      </div>

      {/* keyed by status: a new status sticks the sticker on again (see .sticker animation) */}
      <button key={`${summary.tone}:${summary.title}`} className={`sticker sticker--${summary.tone}`} onClick={() => setDetail({ kind: 'hero' })} aria-live="polite">
        <span className="sticker__name">{name}</span>
        <span className="sticker__status">
          <span className="sticker__icon"><Icon name={summary.icon} size={16} /></span>
          {summary.title}
        </span>
        <span className="sticker__line">{summary.line}</span>
      </button>

      <div className="home__body">
        {crash && (
          <CrashPlan
            device={device}
            event={crash}
            serverNow={serverNow}
            onAcknowledged={props.onAcknowledged}
            onSaved={props.onSaved}
          />
        )}
        {others.length > 0 && (
          <ul className="also">
            {others.map((type) => (
              <li key={type}>
                <button className="row" onClick={() => setDetail({ kind: 'alert', type })}>
                  <span className={`disc disc--sm tone-${alertTone(type)}`}><Icon name={EVENT_ICON[type]} size={18} /></span>
                  <strong>{title(type)}</strong>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <NotifyPrompt name={childName(device) ?? 'the rider'} />

        <ul className="facts" aria-label="Right now">
          {facts.map((fact) => (
            <li key={fact.key}>
              <button className="fact" onClick={() => setDetail({ kind: 'chip', chip: fact.key })}>
                <Icon name={fact.icon} size={20} />
                <span className="fact__label">{fact.label}</span>
                {/* While the app can't reach Helmetto nothing here is current. */}
                <span className={`fact__value tone-${offline ? 'unknown' : fact.tone}`}>
                  {offline ? (fact.key === 'scooter' ? 'No connection' : fact.key === 'helmet' ? 'Unknown' : '–') : fact.value}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button className="fact" onClick={props.onOpenMap}>
              <Icon name="zone" size={20} />
              <span className="fact__label">Safe zone</span>
              <span className={`fact__value tone-${offline ? 'unknown' : zone.tone}`}>{offline ? '–' : (ZONE_VALUE[zone.text] ?? zone.text)}</span>
            </button>
          </li>
        </ul>

        <section className="today" aria-label="Today">
          <div className="today__head">
            <h2>Today</h2>
            {events.length > 0 && <button className="text-button" onClick={props.onOpenAlerts}>All alerts</button>}
          </div>
          {today.length === 0 ? (
            <p className="empty">Nothing has happened today.</p>
          ) : (
            <ol className="timeline">
              {today.map((event) => (
                <li key={event.id} className={`timeline__item tone-${event.severity === 'alert' ? 'alert' : 'ok'}`}>
                  <time dateTime={event.created_at}>{clock(event.created_at)}</time>
                  <i className="timeline__dot" />
                  <span>{title(event.type)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {offline?.server && <p className="home__server">Server: {offline.server}</p>}
      </div>

      {detail && openAlert && (
        <Sheet title={title(openAlert)} icon={EVENT_ICON[openAlert]} tone={alertTone(openAlert)} onClose={() => setDetail(null)}>
          <p>{ALERT_HELP[openAlert]}</p>
          {since(openAlert) && (
            <p className="meta">Since {clock(since(openAlert)!)}, {duration(since(openAlert), serverNow)} ago</p>
          )}
          <div className="sheet__actions">
            {position && <button className="button" onClick={props.onOpenMap}>Show on map</button>}
            <button className="button button--primary" onClick={props.onOpenAlerts}>All alerts</button>
          </div>
        </Sheet>
      )}
      {detail?.kind === 'hero' && !openAlert && (
        <Sheet title={summary.title} icon={summary.icon} tone={summary.tone} onClose={() => setDetail(null)}>
          <p>{summary.help}</p>
          {hasReported(device) && <p className="meta">Last update {ago(device.last_seen_at, serverNow)}</p>}
        </Sheet>
      )}
      {openChip && (
        <Sheet title={`${openChip.label}: ${openChip.value === '—' ? 'unknown' : openChip.value}`} icon={openChip.icon} tone={openChip.tone} onClose={() => setDetail(null)}>
          <p>{openChip.help}</p>
        </Sheet>
      )}
    </div>
  );
}
