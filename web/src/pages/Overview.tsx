import { useState } from 'react';
import type { DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { RemoveEquipment } from '../RemoveEquipment';
import { GearBoard } from '../GearBoard';
import { StatusHead } from '../StatusHead';
import { activeEvent, attention, deviceStatus, fleetHero, kindOf, KIND_ICON, subtitle } from '../status';
import { ago } from '../time';

function EquipmentBoard({ device, serverNow, onOpen }: { device: DeviceState; serverNow: number; onOpen: () => void }) {
  const status = deviceStatus(device);
  return (
    <button className={`board board--${status.tone}`} onClick={onOpen}>
      <span className="board__head">
        <span className="board__kind"><Icon name={KIND_ICON[kindOf(device)]} size={22} /></span>
        <span className="board__name">{device.name}</span>
        <span className={`tag tone-${status.tone}`}>
          {status.icon === 'lock' && <Icon name="lock" size={12} />}
          {status.label}
        </span>
      </span>
      <span className="board__sub">
        <span>{subtitle(device)}</span>
        {device.last_seen_at && <time>{ago(device.last_seen_at, serverNow)}</time>}
      </span>
      <GearBoard device={device} />
    </button>
  );
}

export function Overview(props: {
  devices: DeviceState[];
  alerts: Record<string, SafetyEvent[]>;
  serverNow: number;
  onOpen: (deviceId: string) => void;
  onAdd: () => void;
  onRemoved: (deviceId: string) => void;
}) {
  const { devices, serverNow } = props;
  const summary = fleetHero(devices);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<DeviceState | null>(null);
  const top = attention(devices)[0];
  const seen = top ? activeEvent(props.alerts[top.device.device_id] ?? [], top.alert)?.acknowledged_at : null;

  return (
    <div className="page">
      <StatusHead
        tone={summary.tone}
        icon={summary.icon}
        title={summary.title}
        line={summary.line}
        foot={`${seen ? 'Acknowledged' : 'Not acknowledged yet'}${summary.more > 0 ? `, ${summary.more} more need attention` : ''}`}
        action="Open"
        onClick={summary.deviceId ? () => props.onOpen(summary.deviceId!) : undefined}
      />

      <div className="label-row">
        <h2 className="label">Equipment <span className="count">{devices.length}</span></h2>
        <button className="text-button" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <ul className="board-list">
        {devices.map((device) => (
          <li key={device.device_id} className={editing ? 'board-edit' : undefined}>
            <EquipmentBoard device={device} serverNow={serverNow} onOpen={() => props.onOpen(device.device_id)} />
            {editing && (
              <button
                className={`remove-btn ${device.removable === false ? 'remove-btn--fixed' : ''}`}
                onClick={() => setRemoving(device)}
                aria-label={`Remove ${device.name}`}
              >
                <Icon name={device.removable === false ? 'lock' : 'trash'} size={20} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {removing && (
        <RemoveEquipment
          device={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(id) => {
            props.onRemoved(id);
            if (devices.length <= 1) setEditing(false);
          }}
        />
      )}
      <button className="button button--block button--dashed" onClick={props.onAdd}>
        <Icon name="plus" size={18} /> Add equipment
      </button>
    </div>
  );
}
