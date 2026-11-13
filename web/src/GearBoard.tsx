import type { DeviceState } from '@helmetto/shared';
import { Icon } from './icons';
import { GEAR_ICON, gearTiles } from './status';

/**
 * Required gear drawn like a workshop shadow board: gear that is on hangs on
 * its peg; gear that is missing leaves only its dashed outline.
 * Rendered with spans so it can sit inside a button.
 */
export function GearBoard({ device, large = false }: { device: DeviceState; large?: boolean }) {
  const gear = gearTiles(device);
  if (gear.length === 0) return <span className="pegs__empty">No gear required. Add some in settings.</span>;
  return (
    <span className={`pegs ${large ? 'pegs--lg' : ''}`} role="list" aria-label="Required gear">
      {gear.map((g) => (
        <span key={g.type} className={`peg peg--${g.tone}`} role="listitem" aria-label={`${g.label}: ${g.value}`}>
          <span className="peg__shape"><Icon name={GEAR_ICON[g.type]} size={large ? 34 : 26} /></span>
          <span className="peg__name">{g.label}</span>
          <span className="peg__state">{g.value}</span>
        </span>
      ))}
    </span>
  );
}
