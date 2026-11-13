import { useState } from 'react';
import type { DeviceState } from '@helmetto/shared';
import { api } from './api';
import { Sheet } from './Sheet';

/** Asks before removing equipment; explains when it can't be removed. */
export function RemoveEquipment(props: { device: DeviceState; onClose: () => void; onRemoved: (deviceId: string) => void }) {
  const { device } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (device.removable === false) {
    return (
      <Sheet title={`Can't remove ${device.name}`} icon="lock" onClose={props.onClose}>
        <p>
          This equipment is set up on the server (<code>DEVICE_ID={device.device_id}</code>), so it would come back on the next restart.
          Change or remove it in the server settings instead.
        </p>
        <div className="sheet__actions">
          <button className="button" onClick={props.onClose}>OK</button>
        </div>
      </Sheet>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteDevice(device.device_id);
      props.onRemoved(device.device_id);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Remove ${device.name}?`} icon="trash" tone="alert" onClose={props.onClose}>
      <p>Its alerts and report data are deleted, and its tag is no longer accepted. This can't be undone.</p>
      {error && <p className="error">{error}</p>}
      <div className="sheet__actions">
        <button className="button" onClick={props.onClose}>Cancel</button>
        <button className="button button--danger-solid" disabled={busy} onClick={remove}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </Sheet>
  );
}
