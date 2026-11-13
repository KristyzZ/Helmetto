import { useEffect, useState } from 'react';
import { GEAR_INFO, routes, type GearType, type ReportResponse, type SafetyEvent } from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { GEAR_ICON, KIND_ICON, complianceTone, formatDuration } from '../status';

const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];
const REFRESH_MS = 15_000;

const pct = (value: number | null) => (value === null ? '—' : `${Math.floor(value * 100)}%`);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow' });

/** Protection statistics: how much of the in-use time had all required gear. */
export function Report({ events }: { events: SafetyEvent[] }) {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // reload when the period changes, when new events arrive, and every few seconds
  const latest = events[0]?.id ?? 0;
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.report(days).then(
        (r) => !cancelled && (setReport(r), setError(null)),
        (e) => !cancelled && setError((e as Error).message),
      );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [days, latest]);

  const t = report?.totals;
  const tone = complianceTone(t?.compliance ?? null);
  const missed = t ? (Object.entries(t.missed) as [GearType, number][]).sort((a, b) => b[1] - a[1]) : [];
  const maxDay = Math.max(1, ...(report?.days.map((d) => d.in_use_s) ?? [1]));

  return (
    <div className="page page--report">
      <div className="page__row">
        <h1 className="page__title">Report</h1>
        <div className="segmented" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.days} role="tab" aria-selected={days === p.days} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!report || !t ? (
        <div className="blank"><div className="spinner" aria-label="Loading" /></div>
      ) : (
        <>
          <section className={`score score--${tone}`}>
            <span className="score__label">Protected time</span>
            <span className="score__value">{pct(t.compliance)}</span>
            <span className="score__line">
              {t.in_use_s > 0 ? `of ${formatDuration(t.in_use_s)} in use` : 'No equipment was used in this period'}
            </span>
            <div className="score__stats">
              <span>
                <strong>{t.incidents}</strong>
                <small>{t.incidents === 1 ? 'incident' : 'incidents'}</small>
              </span>
              <span>
                <strong>{formatDuration(t.unprotected_s)}</strong>
                <small>without gear</small>
              </span>
            </div>
          </section>

          {report.days.length > 1 && (
            <section>
              <h2 className="label">Time in use per day</h2>
              <div className="bars" role="img" aria-label="Protected and unprotected time per day">
                {report.days.map((d) => (
                  <div key={d.day} className="bars__day" title={`${d.day}: ${formatDuration(d.in_use_s)} in use, ${formatDuration(d.unprotected_s)} without gear`}>
                    <div className="bars__track">
                      <div className={`bars__bar ${d.in_use_s > 0 ? '' : 'bars__bar--empty'}`} style={{ height: `${(d.in_use_s / maxDay) * 100}%` }}>
                        <div className="bars__bad" style={{ height: d.in_use_s ? `${(d.unprotected_s / d.in_use_s) * 100}%` : 0 }} />
                      </div>
                    </div>
                    {report.days.length <= 10 && <span className="bars__label">{weekday(d.day)}</span>}
                  </div>
                ))}
              </div>
              <div className="legend">
                <span><i className="dot tone-ok" />With gear</span>
                <span><i className="dot tone-alert" />Without gear</span>
              </div>
            </section>
          )}

          <section>
            <h2 className="label">By equipment</h2>
            <ul className="list">
              {report.devices.map((d) => {
                const dTone = complianceTone(d.compliance);
                return (
                  <li key={d.device_id} className="rrow">
                    <Icon name={KIND_ICON[d.kind]} size={20} />
                    <span className="rrow__text">
                      <strong>{d.name}</strong>
                      <small>
                        {d.in_use_s > 0 ? `${formatDuration(d.in_use_s)} in use` : 'Not used'}
                        {d.incidents > 0 && `, ${d.incidents} incident${d.incidents > 1 ? 's' : ''}`}
                      </small>
                      <span className="meter"><span className={`meter__fill tone-${dTone}`} style={{ width: `${(d.compliance ?? 0) * 100}%` }} /></span>
                    </span>
                    <span className={`rrow__pct tone-${dTone}`}>{pct(d.compliance)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {(report.workers?.length ?? 0) > 0 && (
            <section>
              <h2 className="label">By person</h2>
              <ul className="list">
                {report.workers!.map((w) => {
                  const wTone = complianceTone(w.compliance);
                  return (
                    <li key={w.worker_id} className="rrow">
                      <Icon name="badge" size={20} />
                      <span className="rrow__text">
                        <strong>{w.name}</strong>
                        <small>
                          {w.in_use_s > 0 ? `${formatDuration(w.in_use_s)} working` : 'No work recorded'}
                          {w.incidents > 0 && `, ${w.incidents} incident${w.incidents > 1 ? 's' : ''}`}
                        </small>
                        <span className="meter"><span className={`meter__fill tone-${wTone}`} style={{ width: `${(w.compliance ?? 0) * 100}%` }} /></span>
                      </span>
                      <span className={`rrow__pct tone-${wTone}`}>{pct(w.compliance)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {missed.length > 0 && (
            <section>
              <h2 className="label">Most often missing</h2>
              <ul className="list">
                {missed.map(([type, count]) => (
                  <li key={type} className="rrow">
                    <Icon name={GEAR_ICON[type]} size={20} />
                    <span className="rrow__text"><strong>{GEAR_INFO[type].label}</strong></span>
                    <span className="rrow__pct">{count}×</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <a className="button button--primary button--block" href={routes.reportCsv(days)} download>
            <Icon name="download" size={18} /> Download CSV
          </a>
          <p className="meta">
            {report.from === report.to ? report.from : `${report.from} to ${report.to}`} (UTC). Time counts only while equipment is in use.
          </p>
        </>
      )}
    </div>
  );
}
