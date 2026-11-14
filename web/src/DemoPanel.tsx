import { useEffect, useState } from 'react';
import { DEMO_SCENARIOS, type DemoScenario, type DemoStatus } from '@helmetto/shared';
import { api } from './api';
import { Icon, type IconName } from './icons';
import { Sheet } from './Sheet';
import type { Tone } from './status';

/** How each scenario looks in the list: the state it puts the app in. */
const LOOK: Partial<Record<DemoScenario, { icon: IconName; tone: Tone }>> = {
  normal: { icon: 'check', tone: 'ok' },
  'helmet-disconnect': { icon: 'helmet', tone: 'alert' },
  'helmet-reconnect': { icon: 'helmet', tone: 'ok' },
  'helmet-not-worn': { icon: 'helmet', tone: 'alert' },
  crash: { icon: 'alert', tone: 'alert' },
  'geofence-exit': { icon: 'zone', tone: 'alert' },
  offline: { icon: 'signalOff', tone: 'warn' },
  'arrive-place': { icon: 'flag', tone: 'ok' },
};

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
          <ul className="scenarios">
            {DEMO_SCENARIOS.map((scenario) => {
              const look = LOOK[scenario.id] ?? { icon: 'play' as const, tone: 'unknown' as const };
              const on = !!status?.running && status.scenario === scenario.id;
              return (
                <li key={scenario.id}>
                  <button className="scenario" aria-pressed={on} onClick={() => run(scenario.id)}>
                    <span className={`disc disc--sm tone-${look.tone}`}><Icon name={look.icon} size={16} /></span>
                    <span className="scenario__text">
                      <strong>{scenario.label}</strong>
                      <small>{scenario.description}</small>
                    </span>
                    {on && <Icon name="check" size={18} />}
                  </button>
                </li>
              );
            })}
          </ul>
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
