import { useState } from 'react';
import {
  EQUIPMENT_INFO,
  NAME_MAX_LENGTH,
  type CreateDeviceResponse,
  type DeviceState,
  type EquipmentKind,
} from '@helmetto/shared';
import { api } from './api';
import { OFFERED_KINDS } from './EquipmentSettings';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { KIND_ICON } from './status';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="copy">
        <code>{value}</code>
        <button
          className="icon-button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // clipboard blocked: the value is selectable
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={18} />
        </button>
      </div>
    </div>
  );
}

/** Register a new piece of equipment; shows its device ID and key once. */
export function AddEquipment(props: { onClose: () => void; onCreated: (state: DeviceState) => void; onOpen: (deviceId: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<EquipmentKind>('power_tool');
  const [operator, setOperator] = useState('');
  const [site, setSite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateDeviceResponse | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createDevice({ name: name.trim(), kind, operator_name: operator.trim() || null, site: site.trim() || null });
      props.onCreated(result.device);
      setCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Sheet title="Equipment added" icon="check" tone="ok" onClose={props.onClose}>
        <p>Put these in the tag's firmware (<code>telemetry_config.h</code>). The key is shown only now.</p>
        <CopyField label="Device ID" value={created.device.device_id} />
        <CopyField label="API key" value={created.api_key} />
        <CopyField label="Telemetry URL" value={`${location.origin}/api/devices/${created.device.device_id}/telemetry`} />
        <div className="sheet__actions">
          <button className="button button--primary" onClick={() => props.onOpen(created.device.device_id)}>Done</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add equipment" icon="plus" onClose={props.onClose}>
      <label className="field">
        <span>Name</span>
        <input value={name} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Angle grinder 2" autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>Type</span>
        <div className="pick">
          {OFFERED_KINDS.map((k) => (
            <button key={k} className="pick__item" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <Icon name={KIND_ICON[k]} size={18} />
              {EQUIPMENT_INFO[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Used by</span>
          <input value={operator} maxLength={NAME_MAX_LENGTH} placeholder="optional" autoComplete="off" onChange={(e) => setOperator(e.target.value)} />
        </label>
        <label className="field">
          <span>Site</span>
          <input value={site} maxLength={NAME_MAX_LENGTH} placeholder="optional" autoComplete="off" onChange={(e) => setSite(e.target.value)} />
        </label>
      </div>
      <p className="meta">Required gear starts as the usual set for this type; change it in the equipment's settings.</p>
      {error && <p className="error">{error}</p>}
      <div className="sheet__actions">
        <button className="button button--primary" disabled={busy || !name.trim()} onClick={create}>
          {busy ? 'Adding…' : 'Add equipment'}
        </button>
      </div>
    </Sheet>
  );
}
