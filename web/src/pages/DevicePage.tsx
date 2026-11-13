import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { AckButton } from '../AckButton';
import { api } from '../api';
import { EquipmentSettings } from '../EquipmentSettings';
import { Icon } from '../icons';
import { MapView } from '../MapView';
import { Sheet } from '../Sheet';
import {
  ALERT_HELP,
  EVENT_ICON,
  GEAR_ICON,
  KIND_ICON,
  alertTone,
  chips,
  gearTiles,
  hasReported,
  hero,
  kindOf,
  location,
  locationLabel,
  subtitle,
  title,
  activeEvent,
  visibleAlerts,
  zoneLabel,
} from '../status';
import { ago, clock, duration } from '../time';

type Detail = { kind: 'hero' } | { kind: 'alert'; type: AlertType } | { kind: 'chip'; key: string } | { kind: 'settings' };

export function DevicePage(props: {
  device: DeviceState;
  events: SafetyEvent[];
  serverNow: number;
  onBack: () => void;
  onOpenMap: () => void;
  onOpenAlerts: () => void;
  onSaved: (state: DeviceState) => void;
  onEvent: (event: SafetyEvent) => void;
  onRemoved: (deviceId: string) => void;
}) {
  const { device, events, serverNow } = props;
  const [detail, setDetail] = useState<Detail | null>(null);

  const summary = hero(device, serverNow);
  const others = visibleAlerts(device).filter((type) => type !== summary.alert);
  const chipList = chips(device, serverNow);
  const gear = gearTiles(device);
  const { position, live } = location(device);
  const zone = zoneLabel(device);
  const shown = visibleAlerts(device) as string[];
  const latest = events.find((e) => !shown.includes(e.type));

  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;
  const openChip = detail?.kind === 'chip' ? chipList.find((c) => c.key === detail.key) : undefined;
  const openAlert = detail?.kind === 'alert' ? detail.type : detail?.kind === 'hero' ? summary.alert : null;
  const close = () => setDetail(null);
  const [locking, setLocking] = useState(false);
  const toggleLock = async () => {
    setLocking(true);
    try {
      props.onSaved(await api.updateDevice(device.device_id, { manual_lock: !device.manual_lock }));
    } finally {
      setLocking(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <button className="icon-button" onClick={props.onBack} aria-label="Back to all equipment">
          <Icon name="back" size={22} />
        </button>
        <span className="page-head__icon"><Icon name={KIND_ICON[kindOf(device)]} size={22} /></span>
        <span className="page-head__text">
          <strong>{device.name}</strong>
          <small>{subtitle(device)}</small>
        </span>
        <button className="icon-button" onClick={() => setDetail({ kind: 'settings' })} aria-label="Equipment settings">
          <Icon name="sliders" size={20} />
        </button>
      </div>

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
        <ul className="list">
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

      <section>
        <h2 className="label">Required gear</h2>
        <div className="gear-grid">
          {gear.map((g) => (
            <div key={g.type} className={`gear gear--${g.tone}`}>
              <span className={`gear__icon tone-${g.tone}`}><Icon name={GEAR_ICON[g.type]} size={22} /></span>
              <span className="gear__value">{g.value}</span>
              <span className="gear__label">{g.label}</span>
            </div>
          ))}
          {gear.length === 0 && <p className="empty">No gear required. Add some in settings.</p>}
        </div>
      </section>

      <div className="chips" style={{ gridTemplateColumns: `repeat(${chipList.length}, 1fr)` }}>
        {chipList.map((chip) => (
          <button key={chip.key} className={`chip chip--${chip.tone}`} onClick={() => setDetail({ kind: 'chip', key: chip.key })}>
            <Icon name={chip.icon} size={18} />
            <span className="chip__value">{chip.value}</span>
            <span className="chip__label">{chip.label}</span>
          </button>
        ))}
      </div>

      {(position || device.geofence) && (
        <button className="preview" onClick={props.onOpenMap} aria-label="Open map">
          <span className="preview__map">
            <MapView
              position={position}
              stale={!live}
              alert={summary.tone === 'alert'}
              zone={device.geofence}
              zoneTone={zone.tone === 'warn' ? 'unknown' : zone.tone}
              follow
              interactive={false}
            />
          </span>
          <span className="preview__foot">
            <span className="state"><i className={`dot tone-${zone.tone}`} />{zone.text}</span>
            <span className="preview__where">{locationLabel(device, serverNow)}</span>
            <Icon name="chevron" size={16} />
          </span>
        </button>
      )}

      <button className={`button button--block ${device.manual_lock ? 'button--primary' : ''}`} disabled={locking} onClick={toggleLock}>
        <Icon name={device.manual_lock ? 'unlock' : 'lock'} size={18} />
        {device.manual_lock ? 'Unlock' : 'Lock now'}
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
        <Sheet title={summary.alert === openAlert ? summary.title : title(openAlert)} icon={EVENT_ICON[openAlert]} tone={alertTone(openAlert)} onClose={close}>
          <p>{ALERT_HELP[openAlert]}</p>
          {since(openAlert) && <p className="meta">Since {clock(since(openAlert)!)} · {duration(since(openAlert), serverNow)}</p>}
          <AckButton event={activeEvent(events, openAlert)} serverNow={serverNow} onDone={props.onEvent} />
          <div className="sheet__actions">
            {position && <button className="button" onClick={props.onOpenMap}>Show on map</button>}
            <button className="button button--primary" onClick={props.onOpenAlerts}>All alerts</button>
          </div>
        </Sheet>
      )}
      {detail?.kind === 'hero' && !openAlert && (
        <Sheet title={summary.title} icon={summary.icon} tone={summary.tone} onClose={close}>
          <p>{summary.help}</p>
        </Sheet>
      )}
      {openChip && (
        <Sheet title={`${openChip.label}: ${openChip.value === '—' ? 'unknown' : openChip.value}`} icon={openChip.icon} tone={openChip.tone} onClose={close}>
          <p>{openChip.help}</p>
        </Sheet>
      )}
      {detail?.kind === 'settings' && (
        <EquipmentSettings device={device} onClose={close} onSaved={props.onSaved} onRemoved={props.onRemoved} />
      )}
    </div>
  );
}
