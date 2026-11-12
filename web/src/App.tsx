import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafetyEvent } from '@helmetto/shared';
import { DemoPanel } from './DemoPanel';
import { Skeleton } from './Skeleton';
import { Icon, type IconName } from './icons';
import { useLive } from './live';
import { showBrowserNotification } from './notify';
import { Alerts } from './pages/Alerts';
import { Dashboard } from './pages/Dashboard';
import { Devices } from './pages/Devices';
import { MapPage } from './pages/MapPage';
import { EVENT_ICON, alertTone, displayName, title, visibleAlerts } from './status';
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
const TOAST_MS = 5_000;

interface Toast {
  event: SafetyEvent;
  /** Set when the event is about a scooter other than the one on screen. */
  about: string | null;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const hash = location.hash.slice(1);
    return isTab(hash) ? hash : 'home';
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(SELECTED_KEY));
  const [toast, setToast] = useState<Toast | null>(null);
  const [demoOpen, setDemoOpen] = useState(() => location.hash === '#demo');
  const logoTaps = useRef<number[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<{ deviceId: string | null; names: Record<string, string> }>({ deviceId: null, names: {} });

  const live = useLive((event) => {
    if (event.severity === 'alert') void showBrowserNotification(title(event.type), event.message, event.type);
    // The screen already shows this scooter's alerts (hero, alert strip, Alerts tab),
    // so a toast is only for what would otherwise go unseen: recoveries, and
    // alerts about another scooter.
    const other = event.device_id !== current.current.deviceId;
    if (event.severity === 'alert' && !other) return;
    setToast({ event, about: other ? (current.current.names[event.device_id] ?? null) : null });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  });

  const now = useNow();
  const serverNow = now + live.clockOffsetMs;
  const device = live.devices.find((d) => d.device_id === selectedId) ?? live.devices[0] ?? null;
  const events = device ? (live.alerts[device.device_id] ?? []) : [];
  const active = device ? visibleAlerts(device) : [];
  current.current = {
    deviceId: device?.device_id ?? null,
    names: Object.fromEntries(live.devices.map((d) => [d.device_id, displayName(d)])),
  };

  const go = useCallback((next: Tab) => {
    setTab(next);
    history.replaceState(null, '', `#${next}`);
    window.scrollTo(0, 0);
  }, []);

  const select = (deviceId: string) => {
    setSelectedId(deviceId);
    try {
      localStorage.setItem(SELECTED_KEY, deviceId);
    } catch {
      // private mode: the choice just won't persist
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

  const down = live.connection === 'down';
  // Home shows alerts in the hero and Alerts lists them; other tabs get one slim strip.
  const strip = device && !down && (tab === 'map' || tab === 'devices') ? active[0] : undefined;

  return (
    <div className={`app app--${tab}`}>
      <header className="topbar">
        <button className="logo" onClick={tapLogo} aria-label="Helmetto">
          <img src="/icon.svg" alt="" width="30" height="30" />
          <span className="logo__word">Helmetto</span>
        </button>
        {device && live.devices.length > 1 && (
          <label className="switcher">
            <span className="avatar avatar--xs" aria-hidden="true">{displayName(device).charAt(0).toUpperCase()}</span>
            <select value={device.device_id} onChange={(e) => select(e.target.value)} aria-label="Scooter">
              {live.devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>{displayName(d)}</option>
              ))}
            </select>
            <Icon name="chevron" size={14} stroke={2.2} />
          </label>
        )}
        <span
          className={`conn conn--${live.connection === 'live' ? 'ok' : down ? 'alert' : 'warn'}`}
          title={`Server connection: ${live.connection}`}
        >
          <i className={`dot tone-${live.connection === 'live' ? 'ok' : down ? 'alert' : 'warn'} ${live.connection === 'live' ? 'dot--pulse' : ''}`} />
          {live.connection === 'live' ? 'Live' : down ? 'Offline' : live.connection === 'polling' ? 'Syncing' : 'Connecting'}
        </span>
      </header>

      {down && (
        <div className="strip tone-warn" role="status">
          <Icon name="signalOff" size={18} />
          <strong>Can't reach Helmetto</strong>
          <span>Showing last known status</span>
        </div>
      )}
      {strip && (
        <button className={`strip tone-${alertTone(strip)}`} onClick={() => go('alerts')} role="alert">
          <Icon name={EVENT_ICON[strip]} size={18} />
          <strong>{title(strip)}</strong>
          {active.length > 1 && <span>+{active.length - 1} more</span>}
          <Icon name="chevron" size={16} />
        </button>
      )}

      <main className="content" key={live.loaded && device ? tab : 'blank'}>
        {!live.loaded ? (
          down ? (
            <div className="blank">
              <span className="blank__art tone-warn"><Icon name="signalOff" size={30} /></span>
              <strong>Can't reach Helmetto</strong>
              <span>Check your internet connection. We keep trying in the background.</span>
              <button className="button button--primary" onClick={() => location.reload()}>
                <Icon name="refresh" size={18} /> Try again
              </button>
            </div>
          ) : (
            <Skeleton />
          )
        ) : !device ? (
          <div className="blank">
            <span className="blank__art tone-unknown"><Icon name="scooter" size={30} /></span>
            <strong>No scooters yet</strong>
            <span>Once a Helmetto scooter is added, its status shows up here.</span>
          </div>
        ) : tab === 'home' ? (
          <Dashboard device={device} events={events} serverNow={serverNow} onOpenMap={() => go('map')} onOpenAlerts={() => go('alerts')} />
        ) : tab === 'map' ? (
          <MapPage key={device.device_id} device={device} serverNow={serverNow} onSaved={live.applyState} />
        ) : tab === 'alerts' ? (
          <Alerts device={device} events={events} serverNow={serverNow} onOpenMap={() => go('map')} />
        ) : (
          <Devices
            devices={live.devices}
            selectedId={device.device_id}
            serverNow={serverNow}
            onSelect={(id) => { select(id); go('home'); }}
            onSaved={live.applyState}
          />
        )}
      </main>

      {toast && (
        <button
          className="toast"
          aria-live="polite"
          onClick={() => {
            if (toast.about) select(toast.event.device_id);
            setToast(null);
          }}
        >
          <span className={`disc disc--xs tone-${toast.event.severity === 'alert' ? 'alert' : 'ok'}`}>
            <Icon name={EVENT_ICON[toast.event.type]} size={14} stroke={2.2} />
          </span>
          <strong>{toast.about ? `${toast.about}: ` : ''}{title(toast.event.type)}</strong>
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((item) => (
          <button key={item.id} className="tab" onClick={() => go(item.id)} aria-current={tab === item.id ? 'page' : undefined}>
            <span className="tab__icon">
              <Icon name={item.icon} stroke={tab === item.id ? 2.2 : 1.8} />
              {item.id === 'alerts' && active.length > 0 && <b className={`badge tone-${alertTone(active[0]!)}`}>{active.length}</b>}
            </span>
            <span className="tab__label">{item.label}</span>
          </button>
        ))}
      </nav>

      {demoOpen && <DemoPanel onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
