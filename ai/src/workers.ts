import type { DeviceState } from '@helmetto/shared';

/**
 * Where a worker is: the online equipment that identified them most recently.
 * null = not at any station right now.
 */
export function stationOf(workerId: string, devices: readonly DeviceState[]): DeviceState | null {
  let best: DeviceState | null = null;
  for (const device of devices) {
    if (!device.online || device.worker_id !== workerId || !device.last_seen_at) continue;
    if (!best || Date.parse(device.last_seen_at) > Date.parse(best.last_seen_at!)) best = device;
  }
  return best;
}

/** "Tomas Petraitis" -> "TP", "Rūta" -> "R" */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Next free tag like TAG-0004, given the tags in use. */
export function nextWorkerTag(existing: readonly string[]): string {
  const used = new Set(existing.map((t) => t.toUpperCase()));
  for (let n = 1; ; n++) {
    const tag = `TAG-${String(n).padStart(4, '0')}`;
    if (!used.has(tag)) return tag;
  }
}
