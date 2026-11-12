import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { MapView } from '../MapView';
import { Sheet } from '../Sheet';
import {
  ALERT_HELP,
  EVENT_ICON,
  alertTone,
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
import { ago, clock, duration } from '../time';

type Detail = { kind: 'hero' } | { kind: 'alert'; type: AlertType } | { kind: 'chip'; chip: Chip['key'] };

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
  const chipList = chips(device, serverNow);
  const { position, live } = location(device);
  const zone = zoneLabel(device);
  // The hero and the rows under it already show active alerts; "Latest" is for anything else.
  const shown = visibleAlerts(device) as string[];
  const latest = events.find((e) => !shown.includes(e.type));

  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;
  const openChip = detail?.kind === 'chip' ? chipList.find((c) => c.key === detail.chip) : undefined;
  const openAlert = detail?.kind === 'alert' ? detail.type : detail?.kind === 'hero' ? summary.alert : null;

  return (
    <div className="page">
      <button className={`hero hero--${summary.tone}`} onClick={() => setDetail({ kind: 'hero' })} aria-live="polite">
        <span className="hero__disc"><Icon name={summary.icon} size={30} /></span>
        <span className="hero__title">{summary.title}</span>
        <span className="hero__line">{summary.line}</span>
        <span className="hero__foot">
          <span>{hasReported(device) ? `Updated ${ago(device.last_seen_at, serverNow)}` : 'Not connected'}</span>
          <span className="hero__more">Details <Icon name="chevron" size={14} /></span>
        </span>
      </button>

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

      <div className="chips">
        {chipList.map((chip) => (
          <button key={chip.key} className={`chip chip--${chip.tone}`} onClick={() => setDetail({ kind: 'chip', chip: chip.key })}>
            <Icon name={chip.icon} size={18} />
            <span className="chip__value">{chip.value}</span>
            <span className="chip__label">{chip.label}</span>
          </button>
        ))}
      </div>

      <button className="preview" onClick={props.onOpenMap} aria-label="Open map">
        <span className="preview__map">
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
            <span className="preview__empty"><Icon name="map" size={22} /> No location yet</span>
          )}
        </span>
        <span className="preview__foot">
          <span className="state"><i className={`dot tone-${zone.tone}`} />{zone.text}</span>
          <span className="preview__where">{position ? locationLabel(device, serverNow) : 'Open map'}</span>
          <Icon name="chevron" size={16} />
        </span>
      </button>

      {latest && (
        <button className="row row--card" onClick={props.onOpenAlerts}>
          <i className={`dot tone-${latest.severity === 'alert' ? 'alert' : 'ok'}`} />
          <span className="row__text">
            <small>Latest</small>
            <strong>{title(latest.type)}</strong>
          </span>
          <time>{ago(latest.created_at, serverNow)}</time>
          <Icon name="chevron" size={16} />
        </button>
      )}

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
      {openChip && (
        <Sheet title={`${openChip.label}: ${openChip.value === '—' ? 'unknown' : openChip.value}`} icon={openChip.icon} tone={openChip.tone} onClose={() => setDetail(null)}>
          <p>{openChip.help}</p>
        </Sheet>
      )}
    </div>
  );
}
