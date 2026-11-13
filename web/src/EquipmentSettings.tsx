import { useState } from 'react';
import {
  EQUIPMENT_INFO,
  EQUIPMENT_KINDS,
  GEAR_INFO,
  GEAR_TYPES,
  NAME_MAX_LENGTH,
  type DeviceState,
  type EquipmentKind,
  type GearType,
} from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { GEAR_ICON, KIND_ICON, kindOf, operatorOf, requiredGear } from './status';

/** Shown in settings; scooters stay supported by the API but aren't offered for new setups. */
const KINDS = EQUIPMENT_KINDS.filter((k) => k !== 'scooter');

export function EquipmentSettings(props: { device: DeviceState; onClose: () => void; onSaved: (state: DeviceState) => void }) {
  const { device } = props;
  const [name, setName] = useState(device.name);
  const [operator, setOperator] = useState(operatorOf(device) ?? '');
  const [site, setSite] = useState(device.site ?? '');
  const [kind, setKind] = useState<EquipmentKind>(kindOf(device));
  const [gear, setGear] = useState<GearType[]>(requiredGear(device));
  const [autoLock, setAutoLock] = useState(!!device.auto_lock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickKind = (next: EquipmentKind) => {
    setKind(next);
    setGear([...EQUIPMENT_INFO[next].defaultGear]);
  };
  const toggleGear = (type: GearType) =>
    setGear((list) => (list.includes(type) ? list.filter((g) => g !== type) : GEAR_TYPES.filter((g) => g === type || list.includes(g))));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      props.onSaved(
        await api.updateDevice(device.device_id, {
          name: name.trim(),
          operator_name: operator.trim() || null,
          site: site.trim() || null,
          kind,
          required_gear: gear,
          auto_lock: autoLock,
        }),
      );
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Equipment settings" icon="sliders" onClose={props.onClose}>
      <label className="field">
        <span>Name</span>
        <input value={name} maxLength={NAME_MAX_LENGTH} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Used by</span>
          <input value={operator} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Tomas" autoComplete="off" onChange={(e) => setOperator(e.target.value)} />
        </label>
        <label className="field">
          <span>Site</span>
          <input value={site} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Workshop A" autoComplete="off" onChange={(e) => setSite(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Type</span>
        <div className="pick">
          {KINDS.map((k) => (
            <button key={k} className="pick__item" aria-pressed={kind === k} onClick={() => pickKind(k)}>
              <Icon name={KIND_ICON[k]} size={18} />
              {EQUIPMENT_INFO[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Required gear</span>
        <div className="pick">
          {GEAR_TYPES.map((g) => (
            <button key={g} className="pick__item" aria-pressed={gear.includes(g)} onClick={() => toggleGear(g)}>
              <Icon name={GEAR_ICON[g]} size={18} />
              {GEAR_INFO[g].label}
            </button>
          ))}
        </div>
      </div>

      <label className="switch">
        <span>
          <strong>Auto-lock</strong>
          <small>Lock the equipment while required gear is missing. Needs lock hardware.</small>
        </span>
        <input type="checkbox" role="switch" checked={autoLock} onChange={(e) => setAutoLock(e.target.checked)} />
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
