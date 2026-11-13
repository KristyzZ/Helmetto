import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from '../notify';
import { Sheet } from '../Sheet';
import { ALERT_HELP, EVENT_ICON, alertLine, alertTone, attention, title } from '../status';
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
  devices: DeviceState[];
  alerts: Record<string, SafetyEvent[]>;
  serverNow: number;
  onOpenDevice: (deviceId: string) => void;
}) {
  const { devices, alerts, serverNow } = props;
  const [openEvent, setOpenEvent] = useState<SafetyEvent | null>(null);
  const [openAlert, setOpenAlert] = useState<{ device: DeviceState; type: AlertType } | null>(null);
  const names = Object.fromEntries(devices.map((d) => [d.device_id, d.name]));
  const active = attention(devices);
  const events = Object.values(alerts).flat().sort((a, b) => b.id - a.id).slice(0, 200);
  const since = (deviceId: string, type: AlertType) => alerts[deviceId]?.find((e) => e.type === type)?.created_at ?? null;

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
            {active.map(({ device, alert }) => {
              const start = since(device.device_id, alert);
              return (
                <li key={device.device_id}>
                  <button className="row" onClick={() => setOpenAlert({ device, type: alert })}>
                    <span className={`disc disc--sm tone-${alertTone(alert)}`}><Icon name={EVENT_ICON[alert]} size={18} /></span>
                    <span className="row__text">
                      <strong>{device.name}</strong>
                      <small>{title(alert)} · {alertLine(alert, device)}</small>
                    </span>
                    {start && <time>{duration(start, serverNow)}</time>}
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              );
            })}
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
                      <span className="row__text">
                        <span>{title(event.type)}</span>
                        <small>{names[event.device_id] ?? event.device_id}</small>
                      </span>
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
        <Sheet title={`${openAlert.device.name}: ${title(openAlert.type)}`} icon={EVENT_ICON[openAlert.type]} tone={alertTone(openAlert.type)} onClose={() => setOpenAlert(null)}>
          <p>{ALERT_HELP[openAlert.type]}</p>
          <div className="sheet__actions">
            <button className="button button--primary" onClick={() => props.onOpenDevice(openAlert.device.device_id)}>Open equipment</button>
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
          <div className="sheet__actions">
            <button className="button" onClick={() => props.onOpenDevice(openEvent.device_id)}>Open equipment</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
