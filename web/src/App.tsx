import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafetyEvent } from '@helmetto/shared';
import { DemoPanel } from './DemoPanel';
import { Icon, type IconName } from './icons';
import { useLive } from './live';
import { showBrowserNotification } from './notify';
import { Alerts } from './pages/Alerts';
import { DevicePage } from './pages/DevicePage';
import { MapPage } from './pages/MapPage';
import { Overview } from './pages/Overview';
import { EVENT_ICON, KIND_ICON, alertTone, attention, deviceStatus, kindOf, location as whereIs, title } from './status';
import { useNow } from './time';

type Tab = 'home' | 'map' | 'alerts';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Equipment', icon: 'grid' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
];
const isTab = (value: string): value is Tab => TABS.some((t) => t.id === value);

const TOAST_MS = 5_000;

interface Route {
  tab: Tab;
  /** Equipment page open on the home tab. */
  deviceId: string | null;
}

function readHash(): Route {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('device/')) return { tab: 'home', deviceId: hash.slice(7) };
  return { tab: isTab(hash) ? hash : 'home', deviceId: null };
}

export function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const [mapId, setMapId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ event: SafetyEvent; name: string } | null>(null);
  const [demoOpen, setDemoOpen] = useState(() => location.hash === '#demo');
  const logoTaps = useRef<number[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const view = useRef({ route, names: {} as Record<string, string> });

  const live = useLive((event) => {
    const name = view.current.names[event.device_id] ?? event.device_id;
    if (event.severity === 'alert') void showBrowserNotification(`${name}: ${title(event.type)}`, event.message, `${event.device_id}:${event.type}`);
    // Alerts are already on screen on the overview, the alerts tab and that equipment's page.
    const r = view.current.route;
    const onScreen = r.tab === 'alerts' || (r.tab === 'home' && (r.deviceId === null || r.deviceId === event.device_id));
    if (event.severity === 'alert' && onScreen) return;
    setToast({ event, name });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  });

  const now = useNow();
  const serverNow = now + live.clockOffsetMs;
  const devices = live.devices;
  const device = route.deviceId ? devices.find((d) => d.device_id === route.deviceId) ?? null : null;
  const mapDevice =
    devices.find((d) => d.device_id === mapId) ?? devices.find((d) => whereIs(d).position) ?? devices[0] ?? null;
  view.current = { route, names: Object.fromEntries(devices.map((d) => [d.device_id, d.name])) };

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    history.replaceState(null, '', next.deviceId ? `#device/${encodeURIComponent(next.deviceId)}` : `#${next.tab}`);
    window.scrollTo(0, 0);
  }, []);
  const openDevice = (deviceId: string) => navigate({ tab: 'home', deviceId });

  // hidden demo panel: five quick taps on the logo
  const tapLogo = () => {
    const time = Date.now();
    logoTaps.current = [...logoTaps.current.filter((t) => time - t < 2500), time];
    if (logoTaps.current.length >= 5) {
      logoTaps.current = [];
      setDemoOpen(true);
    } else if (logoTaps.current.length === 1) {
      navigate({ tab: 'home', deviceId: null });
    }
  };

  useEffect(() => {
    const onHash = () => (location.hash === '#demo' ? setDemoOpen(true) : setRoute(readHash()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const down = live.connection === 'down';
  const urgent = attention(devices);
  const alertCount = urgent.filter((u) => u.alert !== 'scooter_offline').length;
  // One slim strip for problems the current screen doesn't already show.
  const strip =
    !down && route.tab === 'map' ? urgent[0]
    : !down && device ? urgent.find((u) => u.device.device_id !== device.device_id)
    : undefined;

  return (
    <div className={`app app--${route.tab}`}>
      <header className="topbar">
        <button className="logo" onClick={tapLogo} aria-label="Helmetto, all equipment">
          <img src="/icon.svg" alt="" width="28" height="28" />
          <span>Helmetto</span>
        </button>
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
        <button className={`strip tone-${alertTone(strip.alert)}`} onClick={() => openDevice(strip.device.device_id)} role="alert">
          <Icon name={EVENT_ICON[strip.alert]} size={18} />
          <strong>{strip.device.name}: {title(strip.alert)}</strong>
          {urgent.length > 1 && route.tab === 'map' && <span>+{urgent.length - 1}</span>}
          <Icon name="chevron" size={16} />
        </button>
      )}

      <main className="content">
        {!live.loaded ? (
          <div className="blank">
            {down ? (
              <><Icon name="signalOff" size={28} /><strong>Can't load your equipment</strong><span>Trying again…</span></>
            ) : (
              <div className="spinner" aria-label="Loading" />
            )}
          </div>
        ) : devices.length === 0 ? (
          <div className="blank">
            <Icon name="shield" size={28} />
            <strong>No equipment yet</strong>
            <span>Add a device on the server to start.</span>
          </div>
        ) : route.tab === 'home' && device ? (
          <DevicePage
            device={device}
            events={live.alerts[device.device_id] ?? []}
            serverNow={serverNow}
            onBack={() => navigate({ tab: 'home', deviceId: null })}
            onOpenMap={() => { setMapId(device.device_id); navigate({ tab: 'map', deviceId: null }); }}
            onOpenAlerts={() => navigate({ tab: 'alerts', deviceId: null })}
            onSaved={live.applyState}
          />
        ) : route.tab === 'home' ? (
          <Overview devices={devices} serverNow={serverNow} onOpen={openDevice} />
        ) : route.tab === 'map' && mapDevice ? (
          <>
            <div className="map-switch" role="tablist" aria-label="Equipment on the map">
              {devices.map((d) => {
                const status = deviceStatus(d);
                return (
                  <button key={d.device_id} role="tab" aria-selected={d.device_id === mapDevice.device_id} onClick={() => setMapId(d.device_id)}>
                    <Icon name={KIND_ICON[kindOf(d)]} size={16} />
                    {d.name}
                    <i className={`dot tone-${status.tone}`} />
                  </button>
                );
              })}
            </div>
            <MapPage key={mapDevice.device_id} device={mapDevice} serverNow={serverNow} onSaved={live.applyState} />
          </>
        ) : (
          <Alerts devices={devices} alerts={live.alerts} serverNow={serverNow} onOpenDevice={openDevice} />
        )}
      </main>

      {toast && (
        <button
          className="toast"
          aria-live="polite"
          onClick={() => {
            openDevice(toast.event.device_id);
            setToast(null);
          }}
        >
          <i className={`dot tone-${toast.event.severity === 'alert' ? 'alert' : 'ok'}`} />
          <strong>{toast.name}: {title(toast.event.type)}</strong>
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="tab"
            onClick={() => navigate({ tab: item.id, deviceId: null })}
            aria-current={route.tab === item.id ? 'page' : undefined}
          >
            <span className="tab__icon">
              <Icon name={item.icon} />
              {item.id === 'alerts' && alertCount > 0 && <b className="badge tone-alert">{alertCount}</b>}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {demoOpen && <DemoPanel devices={devices} onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
