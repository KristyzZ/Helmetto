import type { DeviceState } from '@helmetto/shared';
import { Icon } from '../icons';
import { hasReported, summarize } from '../status';
import { ago } from '../time';

export function Devices(props: {
  devices: DeviceState[];
  selectedId: string;
  serverNow: number;
  onSelect: (deviceId: string) => void;
}) {
  return (
    <div className="page">
      <h1 className="page__title">Scooters</h1>
      <ul className="device-list">
        {props.devices.map((device) => {
          const summary = summarize(device);
          const connection = !hasReported(device) ? 'Never connected' : device.online ? 'Online' : 'Offline';
          return (
            <li key={device.device_id}>
              <button
                className={`device ${device.device_id === props.selectedId ? 'device--selected' : ''}`}
                onClick={() => props.onSelect(device.device_id)}
              >
                <span className={`device__icon tone-${device.online ? 'ok' : 'muted'}`}>
                  <Icon name="scooter" size={24} />
                </span>
                <span className="device__body">
                  <strong>{device.name}</strong>
                  <span className="device__status">
                    <i className={`dot dot--${device.online ? 'ok' : 'muted'}`} />
                    {connection}
                    {device.online && summary.tone === 'danger' && <em className="chip chip--danger">{summary.title}</em>}
                  </span>
                  <small>
                    {hasReported(device) ? `Last seen ${ago(device.last_seen_at, props.serverNow)}` : 'No data received yet'}
                    {' · '}ID {device.device_id}
                  </small>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hint">
        Each scooter reports with its own device ID and key. More scooters can be added to this account on the server.
      </p>
    </div>
  );
}
