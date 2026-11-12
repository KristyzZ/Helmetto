import { Simulator } from '@helmetto/scripts/simulator';
import type { DemoScenario, DemoStatus } from '@helmetto/shared';
import type { Config } from './config';

/**
 * Runs the same simulator as scripts/simulate.ts inside the server process for
 * the in-app Demo panel. It still POSTs real HTTP telemetry to this server
 * with the device key, so demo data takes exactly the hardware path.
 */
export class DemoRunner {
  private simulator: Simulator | null = null;

  constructor(private config: Config) {}

  status(): DemoStatus {
    return {
      enabled: this.config.demoMode,
      running: this.simulator !== null,
      scenario: this.simulator?.scenario ?? null,
      device_id: this.config.demoMode ? this.config.device.id : null,
    };
  }

  run(scenario: DemoScenario): DemoStatus {
    if (!this.simulator) {
      this.simulator = new Simulator({
        baseUrl: `http://127.0.0.1:${this.config.port}`,
        deviceId: this.config.device.id,
        apiKey: this.config.device.apiKey,
        log: (line) => console.log(`[demo] ${line}`),
      });
      this.simulator.start(scenario);
    } else {
      this.simulator.setScenario(scenario);
    }
    return this.status();
  }

  stop(): DemoStatus {
    this.simulator?.stop();
    this.simulator = null;
    return this.status();
  }
}
