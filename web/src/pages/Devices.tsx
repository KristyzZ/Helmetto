import { useState } from 'react';
import { NAME_MAX_LENGTH, type DeviceState } from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { childName, displayName, hasReported, visibleAlerts } from '../status';
import { ago } from '../time';

function EditSheet(props: { device: DeviceState; onClose: () => void; onSaved: (state: DeviceState) => void }) {
  const { device } = props;
  const [child, setChild] = useState(device.child_name ?? '');
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      props.onSaved(await api.updateDevice(device.device_id, { child_name: child.trim() || null, name: name.trim() }));
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Edit scooter" icon="edit" onClose={props.onClose}>
      <label className="field">
        <span>Child's name</span>
        <input value={child} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Emma" autoComplete="off" onChange={(e) => setChild(e.target.value)} />
      </label>
      <label className="field">
        <span>Scooter name</span>
        <input value={name} maxLength={NAME_MAX_LENGTH} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="meta">Device ID {device.device_id}</p>
      {error && <p className="error">{error}</p>}
      <div className="sheet__actions">
        <button className="button button--primary" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}

export function Devices(props: {
  devices: DeviceState[];
  selectedId: string;
  serverNow: number;
  onSelect: (deviceId: string) => void;
  onSaved: (state: DeviceState) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const editingDevice = props.devices.find((d) => d.device_id === editing);

  return (
    <div className="page">
      <h1 className="page__title">Scooters</h1>
      <ul className="list">
        {props.devices.map((device) => {
          const alerts = visibleAlerts(device);
          const tone = !hasReported(device) ? 'unknown' : !device.online ? 'warn' : alerts.length ? 'alert' : 'ok';
          const state = !hasReported(device)
            ? 'Never connected'
            : !device.online
              ? `Offline · seen ${ago(device.last_seen_at, props.serverNow)}`
              : alerts.length
                ? `${alerts.length} active alert${alerts.length > 1 ? 's' : ''}`
                : 'Online';
          return (
            <li key={device.device_id} className="device">
              <button className="row" onClick={() => props.onSelect(device.device_id)} aria-pressed={device.device_id === props.selectedId}>
                <span className="avatar">{displayName(device).charAt(0).toUpperCase()}</span>
                <span className="row__text">
                  <strong>{displayName(device)}</strong>
                  <small>{childName(device) ? device.name : `ID ${device.device_id}`}</small>
                  <span className="state"><i className={`dot tone-${tone}`} />{state}</span>
                </span>
                {device.device_id === props.selectedId && props.devices.length > 1 && <Icon name="check" size={18} />}
              </button>
              <button className="icon-button" onClick={() => setEditing(device.device_id)} aria-label={`Edit ${displayName(device)}`}>
                <Icon name="edit" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {editingDevice && <EditSheet device={editingDevice} onClose={() => setEditing(null)} onSaved={props.onSaved} />}
    </div>
  );
}
