import { useEffect, useState } from 'react';
import { initials, stationOf } from '@helmetto/ai';
import { NAME_MAX_LENGTH, type DeviceState, type ReportResponse, type SafetyEvent, type Worker } from '@helmetto/shared';
import { api } from '../api';
import { StatusHead } from '../StatusHead';
import { Icon } from '../icons';
import { MapView } from '../MapView';
import { Sheet } from '../Sheet';
import {
  EVENT_ICON,
  GEAR_ICON,
  KIND_ICON,
  complianceTone,
  formatDuration,
  gearTiles,
  kindOf,
  location,
  title,
  workerStatus,
  type Tone,
} from '../status';
import { ago } from '../time';

function Avatar({ name, tone }: { name: string; tone: string }) {
  return <span className={`avatar tone-${tone}`}>{initials(name)}</span>;
}

/** Add or edit a person. A new person gets a tag ID to program into their gear tags. */
export function WorkerSheet(props: {
  worker?: Worker;
  onClose: () => void;
  onSaved: (worker: Worker) => void;
  onRemoved?: (workerId: string) => void;
}) {
  const { worker } = props;
  const [name, setName] = useState(worker?.name ?? '');
  const [role, setRole] = useState(worker?.role ?? '');
  const [tag, setTag] = useState(worker?.tag_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Worker | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const fields = { name: name.trim(), role: role.trim() || null, ...(tag.trim() ? { tag_id: tag.trim() } : {}) };
      const result = worker ? await api.updateWorker(worker.worker_id, fields) : await api.createWorker(fields);
      props.onSaved(result);
      if (worker) props.onClose();
      else setCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Sheet title="Person added" icon="check" tone="ok" onClose={props.onClose}>
        <p>Program this ID into {created.name}'s gear tags. Equipment that hears them will show who is working.</p>
        <div className="tag-id"><Icon name="badge" size={22} /><code>{created.tag_id}</code></div>
        <div className="sheet__actions">
          <button className="button button--primary" onClick={props.onClose}>Done</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={worker ? 'Edit person' : 'Add person'} icon="users" onClose={props.onClose}>
      <label className="field">
        <span>Name</span>
        <input value={name} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Tomas Petraitis" autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Role</span>
          <input value={role} maxLength={NAME_MAX_LENGTH} placeholder="optional" autoComplete="off" onChange={(e) => setRole(e.target.value)} />
        </label>
        <label className="field">
          <span>Tag ID</span>
          <input
            value={tag}
            maxLength={32}
            placeholder="automatic"
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(e) => setTag(e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <p className="meta">The tag ID is what this person's gear tags send. Leave it empty to get the next free one.</p>
      {error && <p className="error">{error}</p>}
      <div className="sheet__actions">
        <button className="button button--primary" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Saving…' : worker ? 'Save' : 'Add person'}
        </button>
      </div>
      {worker && props.onRemoved && (
        !confirmRemove ? (
          <button className="text-button text-button--danger" onClick={() => setConfirmRemove(true)}>Remove person</button>
        ) : (
          <div className="confirm">
            <p>Remove {worker.name}? Their gear tags will no longer identify anyone. Past alerts are kept.</p>
            <div className="sheet__actions">
              <button className="button" onClick={() => setConfirmRemove(false)}>Cancel</button>
              <button
                className="button button--danger-solid"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.deleteWorker(worker.worker_id);
                    props.onRemoved!(worker.worker_id);
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )
      )}
    </Sheet>
  );
}

export function People(props: {
  workers: Worker[];
  devices: DeviceState[];
  onOpen: (workerId: string) => void;
  onSaved: (worker: Worker) => void;
}) {
  const [adding, setAdding] = useState(false);
  const rows = props.workers.map((w) => ({ worker: w, status: workerStatus(stationOf(w.worker_id, props.devices)) }));
  const count = (tone: string) => rows.filter((r) => r.status.tone === tone).length;
  const working = rows.filter((r) => r.status.station).length;

  return (
    <div className="page">
      <h1 className="page__title">People</h1>

      <div className="tally">
        <span className="tone-ok"><strong>{count('ok')}</strong><small>Protected</small></span>
        <span className="tone-alert"><strong>{count('alert')}</strong><small>Not protected</small></span>
        <span className="tone-unknown"><strong>{rows.length - working}</strong><small>Not at a station</small></span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No people yet. Add the people who use the equipment, then program their tag ID into their gear tags.</p>
      ) : (
        <ul className="eq-list">
          {rows.map(({ worker, status }) => (
            <li key={worker.worker_id}>
              <button className={`eq eq--${status.tone === 'alert' ? 'alert' : 'none'}`} onClick={() => props.onOpen(worker.worker_id)}>
                <Avatar name={worker.name} tone={status.tone} />
                <span className="eq__body">
                  <span className="eq__top">
                    <strong>{worker.name}</strong>
                    <span className={`tag tone-${status.tone}`}>{status.tone === 'ok' ? 'Protected' : status.tone === 'alert' ? 'Not protected' : status.station ? 'Idle' : 'Away'}</span>
                  </span>
                  <span className="eq__sub">{[worker.role, worker.tag_id].filter(Boolean).join(', ')}</span>
                  <span className="where">
                    {status.station ? (
                      <><Icon name={KIND_ICON[kindOf(status.station)]} size={16} />{status.station.name}{status.station.site ? `, ${status.station.site}` : ''}</>
                    ) : (
                      <><Icon name="signalOff" size={16} />Not at a station</>
                    )}
                  </span>
                  {status.tone === 'alert' && <span className="where where--alert">{status.label}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="button button--block button--dashed" onClick={() => setAdding(true)}>
        <Icon name="plus" size={18} /> Add person
      </button>
      <p className="meta">A person's location is only known while equipment hears their gear tags: it is that equipment's location.</p>

      {adding && <WorkerSheet onClose={() => setAdding(false)} onSaved={props.onSaved} />}
    </div>
  );
}

export function WorkerPage(props: {
  worker: Worker;
  devices: DeviceState[];
  events: SafetyEvent[];
  serverNow: number;
  onBack: () => void;
  onOpenDevice: (deviceId: string) => void;
  onSaved: (worker: Worker) => void;
  onRemoved: (workerId: string) => void;
}) {
  const { worker, serverNow } = props;
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const status = workerStatus(stationOf(worker.worker_id, props.devices));
  const station = status.station;
  const mine = props.events.filter((e) => e.worker_id === worker.worker_id);
  const names = Object.fromEntries(props.devices.map((d) => [d.device_id, d.name]));
  const latestId = mine[0]?.id ?? 0;

  useEffect(() => {
    let cancelled = false;
    const load = () => api.report(1).then((r) => !cancelled && setReport(r), () => {});
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [latestId]);
  const today = report?.workers?.find((w) => w.worker_id === worker.worker_id);
  const { position, live } = station ? location(station) : { position: null, live: false };

  const hero =
    !station
      ? { tone: 'unknown', icon: 'signalOff' as const, title: 'Not at a station', line: 'No equipment hears their gear tags right now' }
      : status.tone === 'alert'
        ? { tone: 'alert', icon: 'shield' as const, title: 'Not protected', line: `${status.label} at the ${station.name.toLowerCase()}` }
        : status.tone === 'ok'
          ? { tone: 'ok', icon: 'check' as const, title: 'Protected', line: `Working at ${station.name}` }
          : { tone: 'unknown', icon: 'power' as const, title: 'At a station', line: `${station.name} is not in use` };

  return (
    <div className="page">
      <div className="page-head">
        <button className="icon-button" onClick={props.onBack} aria-label="Back to all people">
          <Icon name="back" size={22} />
        </button>
        <Avatar name={worker.name} tone={status.tone} />
        <span className="page-head__text">
          <strong>{worker.name}</strong>
          <small>{[worker.role, worker.tag_id].filter(Boolean).join(', ')}</small>
        </span>
        <button className="icon-button" onClick={() => setEditing(true)} aria-label="Edit person">
          <Icon name="sliders" size={20} />
        </button>
      </div>

      <StatusHead tone={hero.tone as Tone} icon={hero.icon} title={hero.title} line={hero.line} />

      {station && (
        <>
          <button className="row row--card" onClick={() => props.onOpenDevice(station.device_id)}>
            <span className="page-head__icon"><Icon name={KIND_ICON[kindOf(station)]} size={20} /></span>
            <span className="row__text">
              <small>At</small>
              <strong>{station.name}{station.site ? `, ${station.site}` : ''}</strong>
            </span>
            <time>{ago(station.last_seen_at, serverNow)}</time>
            <Icon name="chevron" size={16} />
          </button>

          <section>
            <h2 className="label">Gear right now</h2>
            <div className="gear-grid">
              {gearTiles(station).map((g) => (
                <div key={g.type} className={`gear gear--${g.tone}`}>
                  <span className={`gear__icon tone-${g.tone}`}><Icon name={GEAR_ICON[g.type]} size={22} /></span>
                  <span className="gear__value">{g.value}</span>
                  <span className="gear__label">{g.label}</span>
                </div>
              ))}
            </div>
          </section>

          {position && (
            <div className="preview">
              <span className="preview__map">
                <MapView position={position} stale={!live} alert={status.tone === 'alert'} zone={station.geofence} follow interactive={false} />
              </span>
            </div>
          )}
        </>
      )}

      <section>
        <h2 className="label">Today</h2>
        <div className="tally">
          <span className={`tone-${complianceTone(today?.compliance ?? null)}`}>
            <strong>{today?.compliance == null ? '—' : `${Math.floor(today.compliance * 100)}%`}</strong>
            <small>Protected</small>
          </span>
          <span className="tone-unknown"><strong>{today ? formatDuration(today.in_use_s) : '—'}</strong><small>Working</small></span>
          <span className={today?.incidents ? 'tone-alert' : 'tone-unknown'}><strong>{today?.incidents ?? '—'}</strong><small>Incidents</small></span>
        </div>
      </section>

      <section>
        <h2 className="label">Recent alerts</h2>
        {mine.length === 0 ? (
          <p className="empty">No alerts for {worker.name.split(' ')[0]}.</p>
        ) : (
          <ul className="list">
            {mine.slice(0, 6).map((e) => (
              <li key={e.id} className="rrow">
                <span className={`disc disc--sm tone-${e.severity === 'alert' ? 'alert' : 'ok'}`}><Icon name={EVENT_ICON[e.type]} size={16} /></span>
                <span className="rrow__text">
                  <strong>{title(e.type)}</strong>
                  <small>{names[e.device_id] ?? 'Removed equipment'}</small>
                </span>
                <time>{ago(e.created_at, serverNow)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && <WorkerSheet worker={worker} onClose={() => setEditing(false)} onSaved={props.onSaved} onRemoved={props.onRemoved} />}
    </div>
  );
}
