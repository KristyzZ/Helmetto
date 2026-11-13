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

/** Offered in the app. Scooters and boats stay valid in the API but are not offered for now. */
export const OFFERED_KINDS: EquipmentKind[] = EQUIPMENT_KINDS.filter((k) => k !== 'scooter' && k !== 'boat');
/** Life jackets belong to the boat use case, which is paused. */
export const OFFERED_GEAR: GearType[] = GEAR_TYPES.filter((g) => g !== 'life_jacket');

export function EquipmentSettings(props: {
  device: DeviceState;
  onClose: () => void;
  onSaved: (state: DeviceState) => void;
  onRemoved: (deviceId: string) => void;
}) {
  const { device } = props;
  const [name, setName] = useState(device.name);
  const [operator, setOperator] = useState(operatorOf(device) ?? '');
  const [site, setSite] = useState(device.site ?? '');
  const [kind, setKind] = useState<EquipmentKind>(kindOf(device));
  const [gear, setGear] = useState<GearType[]>(requiredGear(device));
  const [autoLock, setAutoLock] = useState(!!device.auto_lock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // An existing boat/scooter keeps its kind and gear visible, even though they are not offered.
  const kinds = OFFERED_KINDS.includes(kind) ? OFFERED_KINDS : [...OFFERED_KINDS, kind];
  const gearChoices = gear.includes('life_jacket') ? GEAR_TYPES : OFFERED_GEAR;

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

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteDevice(device.device_id);
      props.onRemoved(device.device_id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setConfirmRemove(false);
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
          {kinds.map((k) => (
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
          {gearChoices.map((g) => (
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

      {!confirmRemove ? (
        <button className="text-button text-button--danger" onClick={() => setConfirmRemove(true)}>
          Remove equipment
        </button>
      ) : (
        <div className="confirm">
          <p>Remove {device.name} and its alert history? Its tag will no longer be accepted.</p>
          <div className="sheet__actions">
            <button className="button" onClick={() => setConfirmRemove(false)}>Cancel</button>
            <button className="button button--danger-solid" disabled={busy} onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
