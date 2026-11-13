import { useState } from 'react';
import type { SafetyEvent } from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';
import { ago } from './time';

const NAME_KEY = 'helmetto.manager';

function storedName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

/** "Acknowledge" for an active alert, or who saw it and when. */
export function AckButton(props: { event: SafetyEvent | null; serverNow: number; onDone: (event: SafetyEvent) => void }) {
  const { event } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!event || event.severity !== 'alert') return null;

  if (event.acknowledged_at) {
    return (
      <p className="meta ack">
        <Icon name="check" size={16} /> Seen {event.acknowledged_by ? `by ${event.acknowledged_by} ` : ''}
        {ago(event.acknowledged_at, props.serverNow)}
      </p>
    );
  }

  return (
    <>
      <button
        className="button button--block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            props.onDone(await api.acknowledge(event.id, storedName()));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="check" size={18} /> {busy ? 'Saving…' : "Acknowledge: I'm on it"}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
