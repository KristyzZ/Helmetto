import { useEffect, useState } from 'react';
import { DEMO_SCENARIOS, type DemoScenario, type DemoStatus } from '@helmetto/shared';
import { api } from './api';
import { Sheet } from './Sheet';

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
    <Sheet title="Demo mode" icon="play" onClose={onClose}>
      {status && !status.enabled ? (
        <p>
          Demo mode is off on this server. Start it with <code>DEMO_MODE=true</code>, or run <code>npm run simulate</code>.
        </p>
      ) : (
        <>
          <div className="scenarios">
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                className="scenario"
                aria-pressed={!!status?.running && status.scenario === scenario.id}
                title={scenario.description}
                onClick={() => run(scenario.id)}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          <div className="sheet__actions sheet__actions--split">
            <span className="meta">{status?.running ? 'Simulated scooter is running' : 'Simulator stopped'}</span>
            <button className="button" disabled={!status?.running} onClick={() => run('stop')}>Stop</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}
