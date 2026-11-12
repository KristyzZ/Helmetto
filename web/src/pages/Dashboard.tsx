import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { MapView } from '../MapView';
import { Sheet } from '../Sheet';
import {
  ALERT_HELP,
  EVENT_ICON,
  alertLine,
  alertTone,
  checks,
  childName,
  chips,
  displayName,
  greeting,
  hasReported,
  hero,
  location,
  locationLabel,
  stats,
  title,
  visibleAlerts,
  zoneLabel,
  type Check,
  type Chip,
} from '../status';
import { ago, clock, duration } from '../time';
import { WeekChart } from '../WeekChart';

type Detail =
  | { kind: 'hero' }
  | { kind: 'alert'; type: AlertType }
  | { kind: 'check'; check: Check['key'] }
  | { kind: 'chip'; chip: Chip['key'] };

const RECENT = 4;

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
  const active = visibleAlerts(device);
  const others = active.filter((type) => type !== summary.alert);
  const checkList = checks(device, serverNow);
  const chipList = chips(device, serverNow);
  const speed = chipList.find((c) => c.key === 'speed')!;
  const battery = chipList.find((c) => c.key === 'battery')!;
  const level = device.telemetry?.battery_percent;
  const kmh = device.online ? device.telemetry?.speed_kmh : null;
  const { position, live } = location(device);
  const zone = zoneLabel(device);
  const week = stats(events, serverNow);
  const name = childName(device);

  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;
  const openCheck = detail?.kind === 'check' ? checkList.find((c) => c.key === detail.check) : undefined;
  const openChip = detail?.kind === 'chip' ? chipList.find((c) => c.key === detail.chip) : undefined;
  const openAlert = detail?.kind === 'alert' ? detail.type : detail?.kind === 'hero' ? summary.alert : null;

  return (
    <div className="page page--home">
      <header className="greet">
        <p className="greet__hello">{greeting(Date.now())}</p>
        <h1 className="greet__title">
          {name ? `${name}’s ride` : displayName(device)}
        </h1>
      </header>

      <section className={`hero hero--${summary.tone}`} aria-live="polite">
        <button className="hero__main" onClick={() => setDetail({ kind: 'hero' })}>
          <span className="hero__top">
            <span className="hero__disc">
              <Icon name={summary.icon} size={28} stroke={2.2} />
            </span>
            <span className="hero__updated">
              {hasReported(device) ? <><i className="dot dot--live" />Updated {ago(device.last_seen_at, serverNow)}</> : 'Not connected yet'}
            </span>
          </span>
          <span className="hero__title">{summary.title}</span>
          <span className="hero__line">
            {summary.line}
            <Icon name="chevron" size={16} stroke={2.2} />
          </span>
        </button>

        {summary.alert && summary.alert !== 'scooter_offline' && (
          <div className="hero__actions">
            {position && (
              <button className="button button--on-alert" onClick={props.onOpenMap}>
                <Icon name="pin" size={18} /> Show on map
              </button>
            )}
            <button className="button button--on-alert-ghost" onClick={() => setDetail({ kind: 'hero' })}>
              What to do
            </button>
          </div>
        )}

        <ul className="checks" aria-label="Safety checks">
          {checkList.map((check) => (
            <li key={check.key}>
              <button className={`check tone-${check.tone}`} onClick={() => setDetail({ kind: 'check', check: check.key })}>
                <span className="check__icon"><Icon name={check.icon} size={18} stroke={2} /></span>
                <span className="check__label">{check.label}</span>
                <span className="check__value">{check.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 && (
        <ul className="card card--list also">
          {others.map((type) => (
            <li key={type}>
              <button className="row" onClick={() => setDetail({ kind: 'alert', type })}>
                <span className={`disc disc--sm tone-${alertTone(type)}`}><Icon name={EVENT_ICON[type]} size={18} /></span>
                <span className="row__text">
                  <strong>{title(type)}</strong>
                  <small>{alertLine(type, device)}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="dash">
        <div className="tiles dash__tiles">
          <button className={`tile tile--${speed.tone}`} onClick={() => setDetail({ kind: 'chip', chip: 'speed' })}>
            <span className="tile__head"><Icon name="gauge" size={16} stroke={2} />Speed</span>
            <span className="tile__value">
              {kmh == null ? '—' : Math.round(kmh)}
              {kmh != null && <small>km/h</small>}
            </span>
            <span className="tile__foot">
              {!device.online ? 'Offline' : kmh == null ? 'Not reported' : kmh > 1 ? 'Riding now' : 'Parked'}
            </span>
          </button>
          <button className={`tile tile--${battery.tone}`} onClick={() => setDetail({ kind: 'chip', chip: 'battery' })}>
            <span className="tile__head"><Icon name="battery" size={16} stroke={2} />Battery</span>
            <span className="tile__value">
              {level == null ? '—' : Math.round(level)}
              {level != null && <small>%</small>}
            </span>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, level ?? 0))}%` }} />
            </span>
          </button>
        </div>

        <button className="card mapcard dash__map" onClick={props.onOpenMap} aria-label="Open map">
          <span className="mapcard__map">
            {position ? (
              <MapView
                position={position}
                label={displayName(device)}
                stale={!live}
                alert={summary.tone === 'alert'}
                zone={device.geofence}
                zoneTone={zone.tone === 'warn' ? 'unknown' : zone.tone}
                follow
                interactive={false}
              />
            ) : (
              <span className="mapcard__empty"><Icon name="map" size={26} /><span>No location yet</span></span>
            )}
          </span>
          <span className="mapcard__foot">
            <span className={`badge-pill tone-${zone.tone}`}><Icon name="zone" size={14} stroke={2} />{zone.text}</span>
            <span className="mapcard__where">{position ? locationLabel(device, serverNow) : 'Open map'}</span>
            <Icon name="chevron" size={16} />
          </span>
        </button>

        <section className="card dash__week">
          <header className="card__head">
            <h2>This week</h2>
            <button className="text-button" onClick={props.onOpenAlerts}>History</button>
          </header>
          <div className="stat">
            {week.week === 0 ? (
              <>
                <span className="stat__value stat__value--ok"><Icon name="check" size={22} stroke={2.4} />No alerts</span>
                <span className="stat__line">A clean week. Nice riding{name ? `, ${name}` : ''}.</span>
              </>
            ) : (
              <>
                <span className="stat__value">{week.week}<small>alert{week.week === 1 ? '' : 's'}</small></span>
                <span className="stat__line">
                  {week.today === 0 ? 'None today' : `${week.today} today`}
                  {week.top && <> · mostly {title(week.top).toLowerCase()}</>}
                </span>
              </>
            )}
          </div>
          <WeekChart stats={week} />
        </section>

        <section className="card dash__recent">
          <header className="card__head">
            <h2>Recent activity</h2>
            {events.length > RECENT && <button className="text-button" onClick={props.onOpenAlerts}>See all</button>}
          </header>
          {events.length === 0 ? (
            <p className="empty">Nothing has happened yet. Events show up here as they happen.</p>
          ) : (
            <ol className="timeline">
              {events.slice(0, RECENT).map((event) => (
                <li key={event.id}>
                  <span className={`disc disc--xs tone-${event.severity === 'alert' ? 'alert' : 'ok'}`}>
                    <Icon name={EVENT_ICON[event.type]} size={14} stroke={2.2} />
                  </span>
                  <span className="timeline__text">{title(event.type)}</span>
                  <time dateTime={event.created_at}>{ago(event.created_at, serverNow)}</time>
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
            <p className="meta">Since {clock(since(openAlert)!)} · {duration(since(openAlert), serverNow)}</p>
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
      {openCheck && (
        <Sheet title={`${openCheck.label}: ${openCheck.value}`} icon={openCheck.icon} tone={openCheck.tone} onClose={() => setDetail(null)}>
          <p>{openCheck.help}</p>
          {openCheck.key === 'zone' && (
            <div className="sheet__actions">
              <button className="button button--primary" onClick={props.onOpenMap}>{device.geofence ? 'Open map' : 'Draw a safe zone'}</button>
            </div>
          )}
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
