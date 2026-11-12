import { useEffect, useState } from 'react';
import { DEMO_SCENARIOS, type DemoScenario, type DemoStatus } from '@helmetto/shared';
import { api } from './api';
import { Icon } from './icons';

/** Hidden panel: tap the logo five times, or open the app with #demo. */
export function DemoPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.demoStatus().then(setStatus).catch((e) => setError((e as Error).message));
  }, []);

  const run = async (scenario: DemoScenario | 'stop') => {
    setError(null);
    try {
      setStatus(await api.runDemo(scenario));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Demo mode" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__title">
          <strong>Demo mode</strong>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {status && !status.enabled ? (
          <p className="muted">
            Demo mode is off on this server. Start it with <code>DEMO_MODE=true</code>, or run{' '}
            <code>npm run simulate</code> on a laptop.
          </p>
        ) : (
          <>
            <p className="muted">
              A simulated scooter{status?.device_id ? ` (${status.device_id})` : ''} sends real telemetry through the
              same API as the hardware.
            </p>
            <div className="scenarios">
              {DEMO_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  className={`scenario ${status?.running && status.scenario === scenario.id ? 'scenario--active' : ''}`}
                  onClick={() => run(scenario.id)}
                >
                  <strong>{scenario.label}</strong>
                  <small>{scenario.description}</small>
                </button>
              ))}
            </div>
            <div className="sheet__actions">
              <span className="muted">{status?.running ? 'Simulator running' : 'Simulator stopped'}</span>
              <button className="button" disabled={!status?.running} onClick={() => run('stop')}>
                Stop simulator
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
