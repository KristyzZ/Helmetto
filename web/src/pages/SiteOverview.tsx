import { useEffect, useState } from 'react';
import { initials, stationOf } from '@helmetto/ai';
import type { DeviceState, ReportResponse, SafetyEvent, Worker } from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { StatusHead } from '../StatusHead';
import {
  EVENT_ICON,
  activeEvent,
  alertLine,
  alertTone,
  attention,
  complianceTone,
  fleetHero,
  inUse,
  title,
  workerStatus,
} from '../status';
import { ago, clock, duration } from '../time';
import { EquipmentBoard } from './Overview';

const REFRESH_MS = 15_000;
const FEED_LENGTH = 12;

const pct = (value: number | null) => (value === null ? '—' : `${Math.floor(value * 100)}%`);

/** Today's protection numbers; reloads on new events and every few seconds. */
function useToday(latestEventId: number): ReportResponse | null {
  const [report, setReport] = useState<ReportResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => api.report(1).then((r) => !cancelled && setReport(r), () => {});
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [latestEventId]);
  return report;
}

/** The desktop home: the whole site on one screen. */
export function SiteOverview(props: {
  devices: DeviceState[];
  workers: Worker[];
  alerts: Record<string, SafetyEvent[]>;
  events: SafetyEvent[];
  serverNow: number;
  onOpenDevice: (deviceId: string) => void;
  onOpenWorker: (workerId: string) => void;
  onOpenAlerts: () => void;
  onOpenReport: () => void;
  onAdd: () => void;
}) {
  const { devices, workers, alerts, events, serverNow } = props;
  const today = useToday(events[0]?.id ?? 0);
  const summary = fleetHero(devices);
  const urgent = attention(devices);
  const top = urgent[0];
  const seen = top ? activeEvent(alerts[top.device.device_id] ?? [], top.alert)?.acknowledged_at : null;

  const running = devices.filter(inUse).length;
  const people = workers.map((w) => ({ worker: w, status: workerStatus(stationOf(w.worker_id, devices)) }));
  const atStation = people.filter((p) => p.status.station).length;
  const names = Object.fromEntries(devices.map((d) => [d.device_id, d.name]));
  const workerNames = Object.fromEntries(workers.map((w) => [w.worker_id, w.name]));
  const compliance = today?.totals.compliance ?? null;
  const incidents = today?.totals.incidents ?? null;

  return (
    <div className="desk">
      <div className="desk__head">
        <h1 className="page__title">Site overview</h1>
        <button className="button button--primary" onClick={props.onAdd}>
          <Icon name="plus" size={18} /> Add equipment
        </button>
      </div>

      <StatusHead
        tone={summary.tone}
        icon={summary.icon}
        title={summary.title}
        line={summary.line}
        foot={`${seen ? 'Acknowledged' : 'Not acknowledged yet'}${summary.more > 0 ? `, ${summary.more} more need attention` : ''}`}
        action="Open"
        onClick={summary.deviceId ? () => props.onOpenDevice(summary.deviceId!) : undefined}
      />

      <button className="figures" onClick={props.onOpenReport} aria-label="Open the report">
        <span className={`figure tone-${complianceTone(compliance)}`}>
          <strong>{pct(compliance)}</strong>
          <small>Protected time today</small>
        </span>
        <span className="figure">
          <strong>{running}<em> of {devices.length}</em></strong>
          <small>Tools running</small>
        </span>
        <span className={`figure ${incidents ? 'tone-alert' : ''}`}>
          <strong>{incidents ?? '—'}</strong>
          <small>{incidents === 1 ? 'Incident today' : 'Incidents today'}</small>
        </span>
        <span className="figure">
          <strong>{atStation}<em> of {workers.length}</em></strong>
          <small>People at a tool</small>
        </span>
      </button>

      <div className="desk__grid">
        <section className="desk__main" aria-label="Equipment">
          <h2 className="label">Equipment <span className="count">{devices.length}</span></h2>
          <ul className="board-grid">
            {devices.map((device) => (
              <li key={device.device_id}>
                <EquipmentBoard device={device} serverNow={serverNow} onOpen={() => props.onOpenDevice(device.device_id)} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="desk__side">
          <section className="panel" aria-label="Needs attention">
            <div className="panel__head">
              <h2>Needs attention</h2>
              <button className="text-button" onClick={props.onOpenAlerts}>All alerts</button>
            </div>
            {urgent.length === 0 ? (
              <p className="panel__empty"><Icon name="check" size={18} /> Nothing right now.</p>
            ) : (
              <ul className="feed">
                {urgent.map(({ device, alert }) => {
                  const event = activeEvent(alerts[device.device_id] ?? [], alert);
                  return (
                    <li key={`${device.device_id}:${alert}`}>
                      <button className="feed__row" onClick={() => props.onOpenDevice(device.device_id)}>
                        <span className={`disc disc--sm tone-${alertTone(alert)}`}><Icon name={EVENT_ICON[alert]} size={16} /></span>
                        <span className="feed__text">
                          <strong>{device.name}</strong>
                          <small>{alertLine(alert, device)}</small>
                        </span>
                        <time>{event ? duration(event.created_at, serverNow) : ''}</time>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" aria-label="People on site">
            <div className="panel__head">
              <h2>People</h2>
            </div>
            {people.length === 0 ? (
              <p className="panel__empty">No one has a gear tag yet.</p>
            ) : (
              <ul className="feed">
                {people.map(({ worker, status }) => (
                  <li key={worker.worker_id}>
                    <button className="feed__row" onClick={() => props.onOpenWorker(worker.worker_id)}>
                      <span className={`avatar avatar--sm tone-${status.tone}`}>{initials(worker.name)}</span>
                      <span className="feed__text">
                        <strong>{worker.name}</strong>
                        <small>{status.station ? `${status.station.name}: ${status.label.toLowerCase()}` : status.label}</small>
                      </span>
                      <i className={`dot tone-${status.tone}`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-label="Activity">
            <div className="panel__head">
              <h2>Activity</h2>
            </div>
            {events.length === 0 ? (
              <p className="panel__empty">Nothing has happened yet today.</p>
            ) : (
              <ol className="feed feed--log">
                {events.slice(0, FEED_LENGTH).map((event) => (
                  <li key={event.id} className="feed__log">
                    <i className={`dot tone-${event.severity === 'alert' ? 'alert' : 'ok'}`} />
                    <span className="feed__text">
                      <span>{title(event.type)}</span>
                      <small>
                        {names[event.device_id] ?? event.device_id}
                        {event.worker_id && workerNames[event.worker_id] ? `, ${workerNames[event.worker_id]}` : ''}
                      </small>
                    </span>
                    <time dateTime={event.created_at} title={ago(event.created_at, serverNow)}>{clock(event.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
