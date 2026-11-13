import { useState } from 'react';
import type { AlertType, DeviceState, SafetyEvent } from '@helmetto/shared';
import { storedName } from './AckButton';
import { api } from './api';
import { Icon } from './icons';
import { EVENT_ICON, alertMessage, alertTone } from './status';
import { ago } from './time';

export interface Popup {
  event: SafetyEvent;
  device: DeviceState;
  /** Who was at the equipment, by name; null = unknown. */
  who: string | null;
}

/**
 * New alerts as cards that stay on screen until someone acts on them:
 * acknowledge, open the equipment, or dismiss. They also go away by
 * themselves when the problem clears.
 */
export function AlertPopups(props: {
  popups: Popup[];
  more: number;
  serverNow: number;
  onOpen: (deviceId: string) => void;
  onOpenAlerts: () => void;
  onDismiss: (eventId: number) => void;
  onAcknowledged: (event: SafetyEvent) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (props.popups.length === 0) return null;

  const acknowledge = async (event: SafetyEvent) => {
    setBusy(event.id);
    try {
      props.onAcknowledged(await api.acknowledge(event.id, storedName()));
    } catch {
      // stays on screen; the alert can still be acknowledged from its page
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="popups" aria-label="New alerts">
      {props.popups.map(({ event, device, who }) => {
        const type = event.type as AlertType;
        const message = alertMessage(type, device, who);
        return (
          <article key={event.id} className={`popup tone-${alertTone(type)}`} role="alert">
            <span className="popup__icon"><Icon name={EVENT_ICON[type]} size={20} /></span>
            <div className="popup__body">
              <strong className="popup__title">{message.title}</strong>
              <p className="popup__line">{message.line}</p>
              <time className="popup__time" dateTime={event.created_at}>{ago(event.created_at, props.serverNow)}</time>
              <div className="popup__actions">
                <button className="popup__ack" disabled={busy === event.id} onClick={() => acknowledge(event)}>
                  <Icon name="check" size={16} /> {busy === event.id ? 'Saving…' : "I'm on it"}
                </button>
                <button className="popup__open" onClick={() => props.onOpen(device.device_id)}>Open</button>
              </div>
            </div>
            <button className="popup__close" onClick={() => props.onDismiss(event.id)} aria-label="Dismiss alert">
              <Icon name="close" size={18} />
            </button>
          </article>
        );
      })}
      {props.more > 0 && (
        <button className="popup__more" onClick={props.onOpenAlerts}>
          {props.more} more {props.more === 1 ? 'alert' : 'alerts'}
        </button>
      )}
    </section>
  );
}
