import type { DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { GEAR_ICON, activeEvent, attention, deviceStatus, fleetHero, gearTiles, kindOf, KIND_ICON, subtitle } from '../status';
import { ago } from '../time';

function EquipmentCard({ device, serverNow, onOpen }: { device: DeviceState; serverNow: number; onOpen: () => void }) {
  const status = deviceStatus(device);
  const gear = gearTiles(device);
  return (
    <button className={`eq eq--${status.tone}`} onClick={onOpen}>
      <span className={`eq__icon tone-${status.tone}`}><Icon name={KIND_ICON[kindOf(device)]} size={24} /></span>
      <span className="eq__body">
        <span className="eq__top">
          <strong>{device.name}</strong>
          <span className={`tag tone-${status.tone}`}>
            {status.icon === 'lock' && <Icon name="lock" size={12} />}
            {status.label}
          </span>
        </span>
        <span className="eq__sub">{subtitle(device)}</span>
        <span className="eq__gear" aria-label="Required gear">
          {gear.map((g) => (
            <span key={g.type} className={`gear-dot tone-${g.tone}`} title={`${g.label}: ${g.value}`}>
              <Icon name={GEAR_ICON[g.type]} size={16} />
            </span>
          ))}
          <span className="eq__seen">{device.last_seen_at ? ago(device.last_seen_at, serverNow) : ''}</span>
        </span>
      </span>
    </button>
  );
}

export function Overview(props: {
  devices: DeviceState[];
  alerts: Record<string, SafetyEvent[]>;
  serverNow: number;
  onOpen: (deviceId: string) => void;
  onAdd: () => void;
}) {
  const { devices, serverNow } = props;
  const summary = fleetHero(devices);
  const top = attention(devices)[0];
  const seen = top ? activeEvent(props.alerts[top.device.device_id] ?? [], top.alert)?.acknowledged_at : null;

  return (
    <div className="page">
      <button
        className={`hero hero--${summary.tone}`}
        onClick={() => summary.deviceId && props.onOpen(summary.deviceId)}
        disabled={!summary.deviceId}
        aria-live="polite"
      >
        <span className="hero__disc"><Icon name={summary.icon} size={30} /></span>
        <span className="hero__title">{summary.title}</span>
        <span className="hero__line">{summary.line}</span>
        {summary.deviceId && (
          <span className="hero__foot">
            <span>
              {seen ? 'Acknowledged' : 'Not acknowledged'}
              {summary.more > 0 ? ` · +${summary.more} more` : ''}
            </span>
            <span className="hero__more">Open <Icon name="chevron" size={14} /></span>
          </span>
        )}
      </button>

      <h2 className="label">Equipment · {devices.length}</h2>
      <ul className="eq-list">
        {devices.map((device) => (
          <li key={device.device_id}>
            <EquipmentCard device={device} serverNow={serverNow} onOpen={() => props.onOpen(device.device_id)} />
          </li>
        ))}
      </ul>
      <button className="button button--block button--dashed" onClick={props.onAdd}>
        <Icon name="plus" size={18} /> Add equipment
      </button>
    </div>
  );
}
