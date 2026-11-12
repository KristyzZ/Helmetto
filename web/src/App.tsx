import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceState, SafetyEvent } from '@helmetto/shared';
import { DemoPanel } from './DemoPanel';
import { Icon, type IconName } from './icons';
import { useLive } from './live';
import { showBrowserNotification } from './notify';
import { Alerts } from './pages/Alerts';
import { Dashboard } from './pages/Dashboard';
import { Devices } from './pages/Devices';
import { MapPage } from './pages/MapPage';
import { ALERT_ADVICE, EVENT_ICON, rideAlerts, title } from './status';
import { useNow } from './time';

type Tab = 'home' | 'map' | 'alerts' | 'devices';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'devices', label: 'Scooters', icon: 'scooter' },
];
const isTab = (value: string): value is Tab => TABS.some((t) => t.id === value);

const SELECTED_KEY = 'helmetto.device';
/** Toasts announce the change; the banner and Alerts tab keep showing what is still active. */
const TOAST_MS = { alert: 9_000, recovery: 6_000 };
const MAX_TOASTS = 3;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Always-visible strip for the selected scooter's active alerts. */
function AlertBanner({ device, onOpen }: { device: DeviceState; onOpen: () => void }) {
  const ride = device.online ? rideAlerts(device) : [];
  const first = ride[0];
  if (first) {
    return (
      <button className="banner banner--danger" onClick={onOpen} role="alert">
        <Icon name={EVENT_ICON[first]} size={22} />
        <span>
          <strong>{title(first)}{ride.length > 1 ? ` +${ride.length - 1} more` : ''}</strong>
          <small>{ALERT_ADVICE[first]}</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
    );
  }
  if (device.active_alerts.includes('scooter_offline')) {
    return (
      <button className="banner banner--muted" onClick={onOpen} role="status">
        <Icon name="signalOff" size={22} />
        <span>
          <strong>Scooter offline</strong>
          <small>Not sending data. Helmet and location status are unknown.</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
    );
  }
  return null;
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const hash = location.hash.slice(1);
    return isTab(hash) ? hash : 'home';
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(SELECTED_KEY));
  const [toasts, setToasts] = useState<SafetyEvent[]>([]);
  const [demoOpen, setDemoOpen] = useState(() => location.hash === '#demo');
  const logoTaps = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const live = useLive((event) => {
    setToasts((list) => [event, ...list.filter((t) => t.id !== event.id)].slice(0, MAX_TOASTS));
    setTimeout(() => dismiss(event.id), TOAST_MS[event.severity]);
    if (event.severity === 'alert') void showBrowserNotification(`Helmetto: ${title(event.type)}`, event.message, event.type);
  });

  const now = useNow();
  const serverNow = now + live.clockOffsetMs;
  const device = live.devices.find((d) => d.device_id === selectedId) ?? live.devices[0] ?? null;
  const events = device ? (live.alerts[device.device_id] ?? []) : [];

  const go = (next: Tab) => {
    setTab(next);
    history.replaceState(null, '', `#${next}`);
    window.scrollTo(0, 0);
  };

  const select = (deviceId: string) => {
    setSelectedId(deviceId);
    try {
      localStorage.setItem(SELECTED_KEY, deviceId);
    } catch {
      // private mode: selection just won't persist
    }
  };

  // hidden demo panel: five quick taps on the logo
  const tapLogo = () => {
    const time = Date.now();
    logoTaps.current = [...logoTaps.current.filter((t) => time - t < 2500), time];
    if (logoTaps.current.length >= 5) {
      logoTaps.current = [];
      setDemoOpen(true);
    }
  };

  useEffect(() => {
    const onHash = () => {
      const hash = location.hash.slice(1);
      if (hash === 'demo') setDemoOpen(true);
      else if (isTab(hash)) setTab(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const alertCount = device ? device.active_alerts.length : 0;

  return (
    <div className={`app app--${tab}`}>
      <header className="topbar">
        <button className="brand" onClick={tapLogo} aria-label="Helmetto">
          <img src="/icon.svg" alt="" width="30" height="30" />
          <span>Helmetto</span>
        </button>
        {device && live.devices.length > 1 ? (
          <select className="device-select" value={device.device_id} onChange={(e) => select(e.target.value)} aria-label="Scooter">
            {live.devices.map((d) => (
              <option key={d.device_id} value={d.device_id}>{d.name}</option>
            ))}
          </select>
        ) : (
          device && <span className="topbar__device">{device.name}</span>
        )}
        <span className={`link-state link-state--${live.connection}`} title={`Server connection: ${live.connection}`}>
          <i />
          {live.connection === 'live' ? 'Live' : live.connection === 'polling' ? 'Syncing' : live.connection === 'down' ? 'No connection' : 'Connecting'}
        </span>
      </header>

      {live.connection === 'down' && (
        <div className="banner banner--warn" role="status">
          <Icon name="signalOff" size={22} />
          <span>
            <strong>Can't reach Helmetto</strong>
            <small>Check this phone's internet connection. The status shown may be out of date.</small>
          </span>
        </div>
      )}
      {device && live.connection !== 'down' && tab !== 'alerts' && <AlertBanner device={device} onOpen={() => go('alerts')} />}

      <main className="content">
        {!live.loaded ? (
          <div className="empty empty--page">
            {live.connection === 'down' ? (
              <><Icon name="signalOff" size={28} /><strong>Can't load your scooters</strong><span>Retrying automatically…</span></>
            ) : (
              <><div className="spinner" /><span>Loading…</span></>
            )}
          </div>
        ) : !device ? (
          <div className="empty empty--page">
            <Icon name="scooter" size={28} />
            <strong>No scooters yet</strong>
            <span>Add a device on the server (DEVICE_ID and DEVICE_API_KEY) to start.</span>
          </div>
        ) : tab === 'home' ? (
          <Dashboard device={device} events={events} serverNow={serverNow} onOpenMap={() => go('map')} onOpenAlerts={() => go('alerts')} />
        ) : tab === 'map' ? (
          <MapPage key={device.device_id} device={device} serverNow={serverNow} onSaved={live.applyState} />
        ) : tab === 'alerts' ? (
          <Alerts device={device} events={events} serverNow={serverNow} />
        ) : (
          <Devices devices={live.devices} selectedId={device.device_id} serverNow={serverNow} onSelect={(id) => { select(id); go('home'); }} />
        )}
      </main>

      <div className="toasts" aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.severity}`}>
            <Icon name={EVENT_ICON[toast.type]} size={20} />
            <span>
              <strong>{title(toast.type)}</strong>
              <small>{toast.message}</small>
            </span>
            <button className="icon-button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>

      <nav className="tabbar">
        {TABS.map((item) => (
          <button key={item.id} className={`tab ${tab === item.id ? 'tab--active' : ''}`} onClick={() => go(item.id)} aria-current={tab === item.id ? 'page' : undefined}>
            <span className="tab__icon">
              <Icon name={item.icon} />
              {item.id === 'alerts' && alertCount > 0 && <b className="badge">{alertCount}</b>}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {demoOpen && <DemoPanel onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
