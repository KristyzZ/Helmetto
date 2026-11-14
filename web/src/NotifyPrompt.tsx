import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from './notify';

const DISMISSED_KEY = 'helmetto.notify-prompt';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Asks once, on Home, to turn notifications on. Gone once answered or dismissed. */
export function NotifyPrompt({ name }: { name: string }) {
  const [permission, setPermission] = useState<NotifyPermission | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissed);
  useEffect(() => {
    void notifyPermission().then(setPermission);
  }, []);
  if (permission !== 'default' || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // private mode: it asks again next time
    }
  };

  return (
    <div className="notify-prompt" role="status">
      <span className="notify-prompt__icon"><Icon name="bell" size={20} /></span>
      <span className="notify-prompt__text">
        <strong>Get alerts on this phone</strong>
        <small>When {name} rides without a helmet, leaves the safe zone or may have crashed.</small>
      </span>
      <button className="button button--primary notify-prompt__on" onClick={async () => setPermission(await requestNotifyPermission())}>
        Turn on
      </button>
      <button className="icon-button" onClick={dismiss} aria-label="Not now">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
