import { EQUIPMENT_INFO, GEAR_INFO, type GearType, type ReportResponse, type ReportStats } from '@helmetto/shared';

const hours = (seconds: number) => (seconds / 3600).toFixed(2);
const percent = (value: number | null) => (value === null ? '' : (value * 100).toFixed(1));
const missedList = (missed: ReportStats['missed']) =>
  (Object.entries(missed) as [GearType, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${GEAR_INFO[type].label} x${count}`)
    .join('; ');

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The report as CSV: one row per equipment, then the fleet total. Opens in Excel / Sheets. */
export function reportCsv(report: ReportResponse): string {
  const header = ['Equipment', 'Type', 'Used by', 'Hours in use', 'Hours without protection', 'Protected %', 'Incidents', 'Missing gear'];
  const rows = report.devices.map((d) => [
    d.name,
    EQUIPMENT_INFO[d.kind].label,
    d.operator_name ?? '',
    hours(d.in_use_s),
    hours(d.unprotected_s),
    percent(d.compliance),
    d.incidents,
    missedList(d.missed),
  ]);
  const t = report.totals;
  rows.push(['All equipment', '', '', hours(t.in_use_s), hours(t.unprotected_s), percent(t.compliance), t.incidents, missedList(t.missed)]);
  const title = [`Helmetto protection report ${report.from} to ${report.to} (UTC)`];
  return [title, header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
