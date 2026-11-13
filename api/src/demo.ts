import { Simulator } from '@helmetto/scripts/simulator';
import type { DemoScenario, DemoStatus } from '@helmetto/shared';
import type { Config } from './config';

/**
 * Runs the same simulator as scripts/simulate.ts inside the server process for
 * the in-app Demo panel, one per device. Each still POSTs real HTTP telemetry
 * to this server with that device's key, so demo data takes the hardware path.
 */
export class DemoRunner {
  private simulators = new Map<string, Simulator>();

  constructor(private config: Config) {}

  private devices() {
    return [this.config.device, ...this.config.demoDevices];
  }

  status(): DemoStatus {
    const main = this.simulators.get(this.config.device.id);
    return {
      enabled: this.config.demoMode,
      running: this.simulators.size > 0,
      scenario: main?.scenario ?? null,
      device_id: this.config.demoMode ? this.config.device.id : null,
      runs: [...this.simulators].map(([device_id, sim]) => ({ device_id, scenario: sim.scenario })),
      devices: this.config.demoMode ? this.devices().map((d) => d.id) : [],
    };
  }

  /** Start or switch one device's scenario. null = not a demo device. */
  run(scenario: DemoScenario, deviceId = this.config.device.id): DemoStatus | null {
    const device = this.devices().find((d) => d.id === deviceId);
    if (!device) return null;
    let simulator = this.simulators.get(deviceId);
    if (!simulator) {
      simulator = new Simulator({
        baseUrl: `http://127.0.0.1:${this.config.port}`,
        deviceId,
        apiKey: device.apiKey,
        workerTags: this.config.demoWorkerTags[deviceId],
        log: (line) => console.log(`[demo ${deviceId}] ${line}`),
      });
      this.simulators.set(deviceId, simulator);
      simulator.start(scenario);
    } else {
      simulator.setScenario(scenario);
    }
    return this.status();
  }

  /** Every device in normal use: the starting point of the fleet demo. */
  startAll(): DemoStatus {
    for (const device of this.devices()) this.run('normal', device.id);
    return this.status();
  }

  /** Stop one device's simulator (no-op if it isn't running), or all of them. */
  stop(deviceId?: string): DemoStatus {
    for (const [id, simulator] of this.simulators) {
      if (deviceId && id !== deviceId) continue;
      simulator.stop();
      this.simulators.delete(id);
    }
    return this.status();
  }
}
