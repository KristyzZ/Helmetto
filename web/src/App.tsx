import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafetyEvent } from '@helmetto/shared';
import { API_BASE } from './api';
import { DemoPanel } from './DemoPanel';
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
    // An impact is reported for a moment only; the crash plan stays up until someone
    // is on it, so "crash cleared" would wrongly sound like the all-clear.
    if (event.type === 'crash_cleared') return;
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
          <img src="/icon.svg" alt="" width="28" height="28" />
        </button>
        {device && live.devices.length > 1 ? (
          <select className="topbar__select" value={device.device_id} onChange={(e) => select(e.target.value)} aria-label="Scooter">
            {live.devices.map((d) => (
              <option key={d.device_id} value={d.device_id}>{displayName(d)}</option>
            ))}
          </select>
        ) : (
          <span className="topbar__name">Helmetto</span>
        )}
        <span className="state topbar__link" title={`Server connection: ${live.connection}`}>
          <i className={`dot tone-${live.connection === 'live' ? 'ok' : down ? 'alert' : 'warn'} ${live.connection === 'live' ? 'dot--pulse' : ''}`} />
          {live.connection === 'live' ? 'Live' : down ? 'No connection' : 'Connecting'}
        </span>
      </header>

      {down && (
        <div className="strip tone-warn" role="status">
          <Icon name="signalOff" size={18} />
          <strong>Can't reach Helmetto</strong>
          <span>Status may be out of date</span>
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

      <main className="content">
        {!live.loaded ? (
          <div className="blank">
            {down ? (
              <>
                <Icon name="signalOff" size={28} />
                <strong>Can't load your scooters</strong>
                <span>Trying again…</span>
                {/* In the iOS app the server is set at build time; show it so a wrong one is easy to spot. */}
                {Capacitor.isNativePlatform() && (
                  <small className="blank__server">Server: {API_BASE || 'not set (rebuild with VITE_API_URL)'}</small>
                )}
              </>
            ) : (
              <div className="spinner" aria-label="Loading" />
            )}
          </div>
        ) : !device ? (
          <div className="blank">
            <Icon name="scooter" size={28} />
            <strong>No scooters yet</strong>
            <span>Add a device on the server to start.</span>
          </div>
        ) : tab === 'home' ? (
          <Dashboard
            device={device}
            events={events}
            serverNow={serverNow}
            onOpenMap={() => go('map')}
            onOpenAlerts={() => go('alerts')}
            onAcknowledged={live.applyEvent}
            onSaved={live.applyState}
          />
        ) : tab === 'map' ? (
          <MapPage key={device.device_id} device={device} serverNow={serverNow} onSaved={live.applyState} />
        ) : tab === 'alerts' ? (
          <Alerts
            device={device}
            events={events}
            serverNow={serverNow}
            onOpenMap={() => go('map')}
            onAcknowledged={live.applyEvent}
            onSaved={live.applyState}
          />
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
          <i className={`dot tone-${toast.event.severity === 'alert' ? 'alert' : 'ok'}`} />
          <strong>{toast.about ? `${toast.about}: ` : ''}{title(toast.event.type)}</strong>
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((item) => (
          <button key={item.id} className="tab" onClick={() => go(item.id)} aria-current={tab === item.id ? 'page' : undefined}>
            <span className="tab__icon">
              <Icon name={item.icon} />
              {item.id === 'alerts' && active.length > 0 && <b className={`badge tone-${alertTone(active[0]!)}`}>{active.length}</b>}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {demoOpen && (
        <DemoPanel
          onClose={() => {
            setDemoOpen(false);
            // Opened from #demo: drop it, or the panel comes back on every reload.
            if (location.hash === '#demo') history.replaceState(null, '', `#${tab}`);
          }}
        />
      )}
    </div>
  );
}
