import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { NAME_MAX_LENGTH, type DeviceState, type SafetyEvent } from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';
import { EditSheet } from './pages/Devices';
import { Sheet } from './Sheet';
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
  const child = childName(device);
  const callRow = phone ? (
    <a className="plan__row plan__row--call" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
      <Icon name="phone" size={20} />
      <span className="plan__row-text">
        <strong>Call {child ?? 'the rider'}</strong>
        <small>{phone}</small>
      </span>
      <Icon name="chevron" size={16} />
    </a>
  ) : (
    <button className="plan__row" onClick={() => setSettings(true)}>
      <Icon name="phone" size={20} />
      <span className="plan__row-text">
        <strong>Add {child ? `${child}'s` : "your child's"} number</strong>
        <small>So you can call from here</small>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
  const shareRow = (
    <button className="plan__row" onClick={share}>
      <Icon name="share" size={20} />
      <span className="plan__row-text"><strong>Share location</strong></span>
      <Icon name="chevron" size={16} />
    </button>
  );

  return (
    <section className={`plan ${handled ? 'plan--handled' : ''}`} aria-label="Crash plan">
      {handled ? (
        <div className="plan__done" aria-live="polite">
          <span className="plan__check"><Icon name="check" size={20} /></span>
          <span className="plan__row-text">
            <strong>{event?.acknowledged_by ? `${event.acknowledged_by} is on it` : 'Someone is on it'}</strong>
            <small>{ago(handled, serverNow)}</small>
          </span>
        </div>
      ) : (
        <h2 className="plan__head">
          <Icon name="alert" size={18} />
          {device.active_alerts.includes('crash_detected') || !event
            ? 'What to do now'
            : `${child ?? 'The rider'} may have crashed at ${clock(event.created_at)}`}
        </h2>
      )}

      <div className="plan__rows">
        {callRow}
        {shareRow}
      </div>

      {!handled && (
        <>
          <button className="plan__onit" disabled={busy || !event} onClick={acknowledge}>
            {busy ? 'Saving…' : "I'm on it"}
          </button>
          <p className="plan__status">Nobody has said they're on it yet.</p>
        </>
      )}
      {note && <p className="meta">{note}</p>}

      {asking && !handled && (
        <Sheet title="Who's handling this?" icon="check" onClose={() => setAsking(false)}>
          <p>Tell the others you're on it, so nobody calls twice.</p>
          <form
            className="plan__who"
            onSubmit={(e) => {
              e.preventDefault();
              void acknowledge();
            }}
          >
            <label className="field">
              <span>Your name</span>
              <input value={parent} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Mum" autoFocus onChange={(e) => setParent(e.target.value)} />
            </label>
            <button className="button button--primary" type="submit" disabled={busy}>
              {parent.trim() ? `I'm on it as ${parent.trim()}` : "I'm on it"}
            </button>
          </form>
        </Sheet>
      )}
      {settings && <EditSheet device={device} focusPhone onClose={() => setSettings(false)} onSaved={props.onSaved} />}
    </section>
  );
}
