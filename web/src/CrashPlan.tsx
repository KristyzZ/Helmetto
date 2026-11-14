import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { NAME_MAX_LENGTH, type DeviceState, type SafetyEvent } from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';
import { EditSheet } from './pages/Devices';
import { childName, location } from './status';
import { ago, clock } from './time';

const PARENT_KEY = 'helmetto.parent';

function storedParent(): string {
  try {
    return localStorage.getItem(PARENT_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeParent(name: string) {
  try {
    localStorage.setItem(PARENT_KEY, name);
  } catch {
    // private mode: we'll ask again next time
  }
}

/** How long the plan stays up after a crash that nobody has acknowledged. */
const OPEN_MS = 30 * 60_000;
/** How long "Mum is on it" stays up after someone acknowledged a crash that is over. */
const HANDLED_MS = 10 * 60_000;

/**
 * The crash the plan is about, or null. An impact is reported for a moment
 * only, so the plan stays until someone says they're on it.
 */
export function crashToHandle(device: DeviceState, events: SafetyEvent[], serverNow: number): SafetyEvent | null {
  const crash = events.find((e) => e.type === 'crash_detected') ?? null;
  const active = device.active_alerts.includes('crash_detected') && device.online;
  if (!crash) return null;
  if (active) return crash;
  if (serverNow - Date.parse(crash.created_at) > OPEN_MS) return null;
  if (!crash.acknowledged_at) return crash;
  return serverNow - Date.parse(crash.acknowledged_at) < HANDLED_MS ? crash : null;
}

/** A link any phone opens in its maps app. */
const mapsUrl = (p: { latitude: number; longitude: number }) =>
  `https://www.google.com/maps?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/**
 * What to do after a crash: call the child, send the location to another
 * adult, and tell the other parents "I'm on it".
 */
export function CrashPlan(props: {
  device: DeviceState;
  /** The active crash alert; null if it hasn't loaded yet. */
  event: SafetyEvent | null;
  serverNow: number;
  onAcknowledged: (event: SafetyEvent) => void;
  onSaved: (state: DeviceState) => void;
}) {
  const { device, event, serverNow } = props;
  const name = childName(device) ?? 'the rider';
  const { position } = location(device);
  const phone = device.child_phone?.trim() || null;

  const [settings, setSettings] = useState(false);
  const [asking, setAsking] = useState(false);
  const [parent, setParent] = useState(storedParent);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const acknowledge = async () => {
    if (!event) return;
    const by = parent.trim();
    if (!by && !asking) return setAsking(true);
    setBusy(true);
    setNote(null);
    try {
      if (by) storeParent(by);
      props.onAcknowledged(await api.acknowledge(event.id, by || null));
      setAsking(false);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setNote(null);
    const when = event ? ` at ${clock(event.created_at)}` : '';
    const text = position
      ? `Helmetto: ${name} may have crashed on the scooter${when}. Last location: ${mapsUrl(position)}`
      : `Helmetto: ${name} may have crashed on the scooter${when}. The location isn't known yet.`;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: `${name} may need help`, text, dialogTitle: 'Send to another adult' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: `${name} may need help`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote('Copied. Paste it into a message to another adult.');
    } catch (e) {
      // The person closed the share sheet: nothing to report.
      if ((e as Error).name === 'AbortError' || /cancel/i.test((e as Error).message)) return;
      setNote("Couldn't open sharing on this device.");
    }
  };

  const handled = event?.acknowledged_at;

  return (
    <section className="plan" aria-label="Crash plan">
      <h2 className="plan__title">
        {device.active_alerts.includes('crash_detected') || !event
          ? 'What to do now'
          : `${childName(device) ?? 'The rider'} may have crashed at ${clock(event.created_at)}`}
      </h2>

      {phone ? (
        <a className="plan__call" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          <Icon name="phone" size={24} />
          <span>
            <strong>Call {childName(device) ?? 'the rider'}</strong>
            <small>{phone}</small>
          </span>
        </a>
      ) : (
        <button className="plan__call plan__call--empty" onClick={() => setSettings(true)}>
          <Icon name="phone" size={24} />
          <span>
            <strong>Add {childName(device) ? `${childName(device)}'s` : "your child's"} number</strong>
            <small>So you can call from here next time</small>
          </span>
        </button>
      )}

      <div className="plan__actions">
        <button className="button" onClick={share}>
          <Icon name="share" size={18} /> Share location
        </button>
        {!handled && (
          <button className="button button--primary" disabled={busy || !event} onClick={acknowledge}>
            <Icon name="check" size={18} /> {busy ? 'Saving…' : "I'm on it"}
          </button>
        )}
      </div>

      {asking && !handled && (
        <form
          className="plan__who"
          onSubmit={(e) => {
            e.preventDefault();
            void acknowledge();
          }}
        >
          <label className="field">
            <span>Your name, so the others know who's on it</span>
            <input value={parent} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Mum" autoFocus onChange={(e) => setParent(e.target.value)} />
          </label>
          <button className="button button--primary" type="submit" disabled={busy}>
            {parent.trim() ? `I'm on it as ${parent.trim()}` : "I'm on it"}
          </button>
        </form>
      )}

      <p className={`plan__status ${handled ? 'plan__status--done' : ''}`} aria-live="polite">
        {handled ? (
          <>
            <Icon name="check" size={16} />
            {event?.acknowledged_by ? `${event.acknowledged_by} is on it` : 'Someone is on it'} ({ago(handled, serverNow)})
          </>
        ) : (
          "Nobody has said they're on it yet."
        )}
      </p>
      {note && <p className="meta">{note}</p>}

      {settings && <EditSheet device={device} focusPhone onClose={() => setSettings(false)} onSaved={props.onSaved} />}
    </section>
  );
}
