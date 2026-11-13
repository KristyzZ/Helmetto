import type { GearType, ReportStats } from '@helmetto/shared';

/** Readings further apart than this are a gap (missed readings, offline): only this much is counted. */
export const MAX_READING_GAP_MS = 15_000;

/** The state that held from one reading until the next. */
export interface ReadingState {
  at: number;
  inUse: boolean;
  unprotected: boolean;
}

export interface Exposure {
  in_use_s: number;
  unprotected_s: number;
}

/**
 * Time to credit for the interval between the previous reading and this one.
 * The previous reading's state is assumed to hold until the next reading.
 */
export function exposureBetween(previous: ReadingState | null, at: number, maxGapMs = MAX_READING_GAP_MS): Exposure {
  if (!previous || at <= previous.at || !previous.inUse) return { in_use_s: 0, unprotected_s: 0 };
  const seconds = Math.min(at - previous.at, maxGapMs) / 1000;
  return { in_use_s: seconds, unprotected_s: previous.unprotected ? seconds : 0 };
}

/** Share of in-use time with all required gear, 0..1; null when it was not used at all. */
export function compliance(inUseS: number, unprotectedS: number): number | null {
  if (inUseS <= 0) return null;
  return Math.max(0, Math.min(1, 1 - unprotectedS / inUseS));
}

export const emptyStats = (): ReportStats => ({ in_use_s: 0, unprotected_s: 0, incidents: 0, compliance: null, missed: {} });

/** Add stats together (days, devices) and recompute compliance. */
export function sumStats(parts: readonly Omit<ReportStats, 'compliance'>[]): ReportStats {
  const total = emptyStats();
  for (const part of parts) {
    total.in_use_s += part.in_use_s;
    total.unprotected_s += part.unprotected_s;
    total.incidents += part.incidents;
    for (const [type, count] of Object.entries(part.missed) as [GearType, number][]) {
      total.missed[type] = (total.missed[type] ?? 0) + count;
    }
  }
  total.in_use_s = Math.round(total.in_use_s);
  total.unprotected_s = Math.round(total.unprotected_s);
  total.compliance = compliance(total.in_use_s, total.unprotected_s);
  return total;
}

/** UTC calendar day, YYYY-MM-DD. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The last `count` UTC days ending with the day of `nowMs`, oldest first. */
export function lastDays(nowMs: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => dayOf(nowMs - (count - 1 - i) * 86_400_000));
}
