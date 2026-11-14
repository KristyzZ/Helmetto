import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
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
}) {
  const { device, events, serverNow } = props;
  const [detail, setDetail] = useState<Detail | null>(null);

  const summary = hero(device, serverNow);
  const others = visibleAlerts(device).filter((type) => type !== summary.alert);
  const facts = chips(device, serverNow);
  const { position, live } = location(device);
  const zone = zoneLabel(device);
  const today = events.filter((e) => dayLabel(e.created_at) === 'Today').slice(0, TODAY_MAX);
  const name = childName(device) ?? device.name;

  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;
  const openChip = detail?.kind === 'chip' ? facts.find((c) => c.key === detail.chip) : undefined;
  const openAlert = detail?.kind === 'alert' ? detail.type : detail?.kind === 'hero' ? summary.alert : null;

  return (
    <div className="home">
      <div className="home__map" onClick={props.onOpenMap}>
        {position ? (
          <MapView
            position={position}
            stale={!live}
            alert={summary.tone === 'alert'}
            zone={device.geofence}
            zoneTone={zone.tone === 'warn' ? 'unknown' : zone.tone}
            follow
            interactive={false}
          />
        ) : (
          <span className="home__nomap"><Icon name="map" size={22} /> No location yet</span>
        )}
        <button className="map-pill" onClick={props.onOpenMap}>
          <i className={`dot tone-${position && live ? 'ok' : 'unknown'}`} />
          {position ? locationLabel(device, serverNow) : 'Open map'}
          <Icon name="chevron" size={14} />
        </button>
      </div>

      <button className={`sticker sticker--${summary.tone}`} onClick={() => setDetail({ kind: 'hero' })} aria-live="polite">
        <span className="sticker__name">{name}</span>
        <span className="sticker__status">
          <Icon name={summary.icon} size={20} />
          {summary.title}
        </span>
        <span className="sticker__line">{summary.line}</span>
      </button>

      <div className="home__body">
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

        <ul className="facts" aria-label="Right now">
          {facts.map((fact) => (
            <li key={fact.key}>
              <button className="fact" onClick={() => setDetail({ kind: 'chip', chip: fact.key })}>
                <Icon name={fact.icon} size={20} />
                <span className="fact__label">{fact.label}</span>
                <span className={`fact__value tone-${fact.tone}`}>{fact.value}</span>
              </button>
            </li>
          ))}
          <li>
            <button className="fact" onClick={props.onOpenMap}>
              <Icon name="zone" size={20} />
              <span className="fact__label">Safe zone</span>
              <span className={`fact__value tone-${zone.tone}`}>{ZONE_VALUE[zone.text] ?? zone.text}</span>
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
