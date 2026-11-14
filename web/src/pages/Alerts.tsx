import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from '../notify';
import { CrashPlan } from '../CrashPlan';
import { Sheet } from '../Sheet';
import { ALERT_HELP, EVENT_ICON, alertLine, alertTone, title, visibleAlerts } from '../status';
import { clock, dayLabel, duration } from '../time';

function Notifications() {
  const [permission, setPermission] = useState<NotifyPermission>(notifyPermission());
  const [open, setOpen] = useState(false);
  const status = { granted: 'On', denied: 'Blocked', default: 'Off', unsupported: 'Not available' }[permission];
  const help = {
    granted: 'You get a notification for every new alert while Helmetto is open, even in the background.',
    denied: 'Notifications are blocked for this site. Allow them in your browser settings, then reload.',
    default: 'Get a notification for every new alert while Helmetto is open, even in the background.',
    unsupported: 'This browser cannot show notifications. Alerts still appear in the app.',
  }[permission];

  return (
    <>
      <button className="row row--card" onClick={() => setOpen(true)}>
        <Icon name="bell" size={20} />
        <span className="row__text"><strong>Notifications</strong></span>
        <span className="state"><i className={`dot tone-${permission === 'granted' ? 'ok' : 'unknown'}`} />{status}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <Sheet title="Notifications" icon="bell" onClose={() => setOpen(false)}>
          <p>{help}</p>
          {permission === 'default' && (
            <div className="sheet__actions">
              <button className="button button--primary" onClick={async () => setPermission(await requestNotifyPermission())}>
                Turn on notifications
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

export function Alerts(props: {
  device: DeviceState;
  events: SafetyEvent[];
  serverNow: number;
  onOpenMap: () => void;
  onAcknowledged: (event: SafetyEvent) => void;
  onSaved: (state: DeviceState) => void;
}) {
  const { device, events, serverNow } = props;
  const [openAlert, setOpenAlert] = useState<AlertType | null>(null);
  const [openEvent, setOpenEvent] = useState<SafetyEvent | null>(null);
  const active = visibleAlerts(device);

  // an active alert started at its newest matching event
  const since = (type: AlertType) => events.find((e) => e.type === type)?.created_at ?? null;

  const days: { label: string; items: SafetyEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(event.created_at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(event);
    else days.push({ label, items: [event] });
  }

  return (
    <div className="page">
      <h1 className="page__title">Alerts</h1>

      <section>
        <h2 className="label">Active now</h2>
        {active.length === 0 ? (
          <div className="row row--card row--static">
            <span className="disc disc--sm tone-ok"><Icon name="check" size={18} /></span>
            <span className="row__text"><strong>No active alerts</strong></span>
          </div>
        ) : (
          <ul className="list">
            {active.map((type) => (
              <li key={type}>
                <button className="row" onClick={() => setOpenAlert(type)}>
                  <span className={`disc disc--sm tone-${alertTone(type)}`}><Icon name={EVENT_ICON[type]} size={18} /></span>
                  <span className="row__text">
                    <strong>{title(type)}</strong>
                    <small>{alertLine(type, device)}</small>
                  </span>
                  {since(type) && <time>{duration(since(type), serverNow)}</time>}
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Notifications />

      <section>
        <h2 className="label">History</h2>
        {events.length === 0 ? (
          <p className="empty">Nothing has happened yet.</p>
        ) : (
          days.map((day) => (
            <div key={day.label} className="day">
              <h3>{day.label}</h3>
              <ul className="list">
                {day.items.map((event) => (
                  <li key={event.id}>
                    <button className="row row--slim" onClick={() => setOpenEvent(event)}>
                      <i className={`dot tone-${event.severity === 'alert' ? 'alert' : 'ok'}`} />
                      <span className="row__text"><span>{title(event.type)}</span></span>
                      <time dateTime={event.created_at}>{clock(event.created_at)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {openAlert && (
        <Sheet title={title(openAlert)} icon={EVENT_ICON[openAlert]} tone={alertTone(openAlert)} onClose={() => setOpenAlert(null)}>
          <p>{ALERT_HELP[openAlert]}</p>
          {since(openAlert) && <p className="meta">Since {clock(since(openAlert)!)}, {duration(since(openAlert), serverNow)} ago</p>}
          {openAlert === 'crash_detected' && (
            <CrashPlan
              device={device}
              event={events.find((e) => e.type === 'crash_detected') ?? null}
              serverNow={serverNow}
              onAcknowledged={props.onAcknowledged}
              onSaved={props.onSaved}
            />
          )}
          <div className="sheet__actions">
            <button className={`button ${openAlert === 'crash_detected' ? '' : 'button--primary'}`} onClick={props.onOpenMap}>Show on map</button>
          </div>
        </Sheet>
      )}
      {openEvent && (
        <Sheet
          title={title(openEvent.type)}
          icon={EVENT_ICON[openEvent.type]}
          tone={openEvent.severity === 'alert' ? 'alert' : 'ok'}
          onClose={() => setOpenEvent(null)}
        >
          <p>{openEvent.message}</p>
          <p className="meta">{new Date(openEvent.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}</p>
        </Sheet>
      )}
    </div>
  );
}
