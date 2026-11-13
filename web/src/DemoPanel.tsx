import { useEffect, useState } from 'react';
import { DEMO_SCENARIOS, type DemoScenario, type DemoStatus, type DeviceState } from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { KIND_ICON, kindOf } from './status';

/** Hidden panel: tap the logo five times, or open the app with #demo. */
export function DemoPanel({ devices, onClose }: { devices: DeviceState[]; onClose: () => void }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.demoStatus().then((s) => {
      setStatus(s);
      setDeviceId((id) => id ?? s.devices?.[0] ?? s.device_id);
    }).catch((e) => setError((e as Error).message));
  }, []);

  const call = async (fn: () => Promise<DemoStatus>) => {
    setError(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const demoDevices = (status?.devices ?? []).map((id) => devices.find((d) => d.device_id === id)).filter(Boolean) as DeviceState[];
  const current = status?.runs?.find((r) => r.device_id === deviceId)?.scenario ?? null;

  return (
    <Sheet title="Demo mode" icon="play" onClose={onClose}>
      {status && !status.enabled ? (
        <p>
          Demo mode is off on this server. Start it with <code>DEMO_MODE=true</code>, or run <code>npm run simulate</code>.
        </p>
      ) : (
        <>
          <div className="pick">
            {demoDevices.map((d) => (
              <button key={d.device_id} className="pick__item" aria-pressed={deviceId === d.device_id} onClick={() => setDeviceId(d.device_id)}>
                <Icon name={KIND_ICON[kindOf(d)]} size={18} />
                {d.name}
                {status?.runs?.some((r) => r.device_id === d.device_id) && <i className="dot tone-ok" />}
              </button>
            ))}
          </div>
          <div className="scenarios">
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                className="scenario"
                aria-pressed={current === scenario.id}
                title={scenario.description}
                disabled={!deviceId}
                onClick={() => call(() => api.runDemo(scenario.id as DemoScenario, deviceId!))}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          <div className="sheet__actions">
            <button className="button" onClick={() => call(() => api.runDemo('start-all'))}>Start all</button>
            <button className="button" disabled={!status?.running} onClick={() => call(() => api.runDemo('stop'))}>Stop all</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}
