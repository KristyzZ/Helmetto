import { useState } from 'react';
import { Icon } from './icons';
import { notifyPermission, requestNotifyPermission } from './notify';

const DISMISSED_KEY = 'helmetto.notify-prompt';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Asks once to turn on notifications, so alerts arrive while Helmetto is in the background. */
export function NotifyPrompt({ wide }: { wide: boolean }) {
  const [permission, setPermission] = useState(notifyPermission);
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (permission !== 'default' || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // private mode: it will ask again next time
    }
  };

  return (
    <div className="notify-prompt" role="status">
      <Icon name="bell" size={20} />
      <span>
        <strong>Get alerts on this {wide ? 'computer' : 'phone'}</strong>
        <small>When someone leaves the work area or works without their gear, even with Helmetto in the background.</small>
      </span>
      <button className="button button--primary" onClick={async () => setPermission(await requestNotifyPermission())}>
        Turn on
      </button>
      <button className="icon-button" onClick={dismiss} aria-label="Not now">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
