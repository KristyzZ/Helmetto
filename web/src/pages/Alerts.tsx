import { useState } from 'react';
import type { DeviceState, SafetyEvent } from '@helmetto/shared';
import { Icon } from '../icons';
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from '../notify';
import { ALERT_ADVICE, EVENT_ICON, title } from '../status';
import { ago, clock, dayLabel, duration } from '../time';

export function EventRow(props: { event: SafetyEvent; serverNow: number; compact?: boolean }) {
  const { event, serverNow, compact } = props;
  return (
    <li className={`event event--${event.severity}`}>
      <span className="event__icon"><Icon name={EVENT_ICON[event.type]} size={18} /></span>
      <span className="event__body">
        <strong>{title(event.type)}</strong>
        {!compact && <span className="event__message">{event.message}</span>}
      </span>
      <time className="event__time" dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
        {compact ? ago(event.created_at, serverNow) : clock(event.created_at)}
      </time>
    </li>
  );
}

function NotificationCard() {
  const [permission, setPermission] = useState<NotifyPermission>(notifyPermission());
  if (permission === 'granted') {
    return <p className="hint"><Icon name="check" size={16} /> Browser notifications are on while Helmetto is open.</p>;
  }
  if (permission === 'unsupported') {
    return <p className="hint">This browser does not support notifications. Alerts still appear here in the app.</p>;
  }
  if (permission === 'denied') {
    return <p className="hint">Notifications are blocked for this site. Allow them in the browser settings to get alerts outside the app.</p>;
  }
  return (
    <div className="card card--row">
      <span>
        <strong>Get notified</strong>
        <small>Show a notification when an alert happens while Helmetto is open in the background.</small>
      </span>
      <button className="button button--primary" onClick={async () => setPermission(await requestNotifyPermission())}>
        Turn on
      </button>
    </div>
  );
}

export function Alerts(props: { device: DeviceState; events: SafetyEvent[]; serverNow: number }) {
  const { device, events, serverNow } = props;

  // when each active alert started = its newest matching event
  const since = (type: string) => events.find((e) => e.type === type)?.created_at ?? null;

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
        <h2 className="section-title">Active now</h2>
        {device.active_alerts.length === 0 ? (
          <div className="card card--ok">
            <Icon name="check" size={20} />
            <span>No active alerts for {device.name}.</span>
          </div>
        ) : (
          <ul className="active-list">
            {device.active_alerts.map((type) => (
              <li key={type} className={`active active--${type === 'scooter_offline' ? 'muted' : 'danger'}`}>
                <span className="active__icon"><Icon name={EVENT_ICON[type]} size={22} /></span>
                <span>
                  <strong>{title(type)}</strong>
                  <span className="active__advice">{ALERT_ADVICE[type]}</span>
                  {since(type) && <small>For {duration(since(type), serverNow)}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotificationCard />

      <section>
        <h2 className="section-title">History</h2>
        {events.length === 0 ? (
          <div className="empty">
            <Icon name="bell" size={26} />
            <strong>No alerts yet</strong>
            <span>Helmet, crash, safe-zone and connection events will be listed here.</span>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.label} className="card">
              <div className="day">{day.label}</div>
              <ul className="events">
                {day.items.map((event) => (
                  <EventRow key={event.id} event={event} serverNow={serverNow} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
