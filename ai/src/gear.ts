import type { GearStatus, GearType, Telemetry } from '@helmetto/shared';

/** What a device must have and do. */
export interface EquipmentProfile {
  requiredGear: readonly GearType[];
  /** Tell the equipment to lock while required gear is missing. */
  autoLock: boolean;
  /** A manager locked it from the app, whatever the gear does. */
  manualLock?: boolean;
}

/** Profile used when none is given: one helmet tag, no lock (the original scooter). */
export const DEFAULT_PROFILE: EquipmentProfile = Object.freeze({ requiredGear: ['helmet'] as GearType[], autoLock: false });

type TelemetryGear = Pick<Telemetry, 'helmet_connected' | 'helmet_worn' | 'gear'>;

/**
 * State of each required gear item from one reading.
 *
 * - With a `gear` array, each required type is looked up in it; a type with no
 *   tag is 'unknown' (never an alert).
 * - Without one (single-tag hardware), helmet_connected / helmet_worn describe
 *   the first required item; the others are 'unknown'.
 */
export function gearStatus(telemetry: TelemetryGear, required: readonly GearType[]): GearStatus[] {
  if (telemetry.gear && telemetry.gear.length > 0) {
    return required.map((type) => {
      const tag = telemetry.gear!.find((g) => g.type === type);
      if (!tag) return { type, state: 'unknown' };
      if (!tag.connected) return { type, state: 'missing' };
      if (tag.worn === false) return { type, state: 'not_worn' };
      return { type, state: 'ok' };
    });
  }
  return required.map((type, index) => {
    if (index > 0) return { type, state: 'unknown' };
    if (!telemetry.helmet_connected) return { type, state: 'missing' };
    if (telemetry.helmet_worn === false) return { type, state: 'not_worn' };
    return { type, state: 'ok' };
  });
}

/** Required gear that is missing or not worn. */
export function unsafeGear(statuses: readonly GearStatus[]): GearType[] {
  return statuses.filter((s) => s.state === 'missing' || s.state === 'not_worn').map((s) => s.type);
}

/** In use right now. Unknown (null) counts as in use: a reporting device is assumed to be running. */
export function isInUse(telemetry: Pick<Telemetry, 'equipment_active' | 'locked'>): boolean {
  if (telemetry.locked === true) return false;
  return telemetry.equipment_active !== false;
}

export interface ProtectionCheck {
  gear: GearStatus[];
  /** Required gear that is missing or not worn. */
  unsafe: GearType[];
  inUse: boolean;
  /** Tell the equipment to (stay) locked: for missing gear (auto-lock) or by a manager. */
  lock: boolean;
  /** Locked because required gear is missing. */
  gearLock: boolean;
  /** The "No protection" alert condition. */
  unprotected: boolean;
}

/**
 * The core rule: equipment in use while required gear is missing is unsafe.
 * With auto-lock the equipment is told to lock, and the alert stays active while
 * it is locked for that reason, so locking it doesn't look like a recovery.
 */
export function checkProtection(telemetry: Telemetry, profile: EquipmentProfile = DEFAULT_PROFILE): ProtectionCheck {
  const gear = gearStatus(telemetry, profile.requiredGear);
  const unsafe = unsafeGear(gear);
  const inUse = isInUse(telemetry);
  const gearLock = profile.autoLock && unsafe.length > 0;
  return {
    gear,
    unsafe,
    inUse,
    gearLock,
    lock: gearLock || profile.manualLock === true,
    // A manual lock is not a safety problem; a lock for missing gear keeps the alert active.
    unprotected: unsafe.length > 0 && (inUse || gearLock),
  };
}
