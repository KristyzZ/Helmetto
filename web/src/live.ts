import { useEffect, useRef, useState } from 'react';
import { routes, type DeviceState, type DevicesResponse, type SafetyEvent, type Worker } from '@helmetto/shared';
import { api } from './api';

/**
 * live:       SSE stream open
 * polling:    SSE unavailable, falling back to polling every few seconds
 * down:       the server can't be reached at all
 */
export type Connection = 'connecting' | 'live' | 'polling' | 'down';

export interface Live {
  loaded: boolean;
  connection: Connection;
  devices: DeviceState[];
  /** Safety history per device, newest first. */
  alerts: Record<string, SafetyEvent[]>;
  /** Add this to Date.now() to get the server's clock. */
  clockOffsetMs: number;
  /** Apply a state returned by a write (e.g. geofence save) without waiting for the stream. */
  applyState: (state: DeviceState) => void;
  /** Apply an updated event (e.g. acknowledged) or a removed device without waiting for the stream. */
  applyEvent: (event: SafetyEvent) => void;
  removeDevice: (deviceId: string) => void;
  /** People whose gear carries a worker tag, by name. */
  workers: Worker[];
  applyWorker: (worker: Worker) => void;
  removeWorker: (workerId: string) => void;
}

const POLL_FAST_MS = 4_000; // while the stream is down
const POLL_SAFETY_MS = 20_000; // belt and braces while the stream is up

/** Keeps device state and alert history in sync: SSE first, polling as fallback. */
export function useLive(onNewEvent: (event: SafetyEvent) => void): Live {
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [alerts, setAlerts] = useState<Record<string, SafetyEvent[]>>({});
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const applyWorker = (worker: Worker) =>
    setWorkers((list) =>
      [...list.filter((w) => w.worker_id !== worker.worker_id), worker].sort((a, b) => a.name.localeCompare(b.name)),
    );
  const removeWorker = (workerId: string) => setWorkers((list) => list.filter((w) => w.worker_id !== workerId));

  const onNewEventRef = useRef(onNewEvent);
  onNewEventRef.current = onNewEvent;
  /** Highest event id seen per device; null until the first history load (no toasts for old events). */
  const seen = useRef<Record<string, number>>({});

  const applyState = (state: DeviceState) => {
    setClockOffsetMs(Date.parse(state.server_time) - Date.now());
    setDevices((list) => {
      const index = list.findIndex((d) => d.device_id === state.device_id);
      if (index === -1) return [...list, state];
      const next = list.slice();
      next[index] = state;
      return next;
    });
  };

  const applyEvent = (event: SafetyEvent) =>
    setAlerts((all) => ({
      ...all,
      [event.device_id]: (all[event.device_id] ?? []).map((x) => (x.id === event.id ? event : x)),
    }));

  const removeDevice = (deviceId: string) => {
    setDevices((list) => list.filter((d) => d.device_id !== deviceId));
    setAlerts((all) => {
      const { [deviceId]: _removed, ...rest } = all;
      return rest;
    });
  };

  useEffect(() => {
    let disposed = false;
    let streamOpen = false;

    const mergeAlerts = (deviceId: string, incoming: SafetyEvent[]) => {
      const known = seen.current[deviceId];
      const fresh = known === undefined ? [] : incoming.filter((e) => e.id > known);
      seen.current[deviceId] = Math.max(known ?? 0, ...incoming.map((e) => e.id));
      setAlerts((all) => {
        const existing = all[deviceId] ?? [];
        const byId = new Map(incoming.map((e) => [e.id, e]));
        const added = incoming.filter((e) => !existing.some((x) => x.id === e.id));
        // Existing events may have changed (acknowledged): take the incoming copy.
        const changed = existing.some((x) => byId.has(x.id) && byId.get(x.id)!.acknowledged_at !== x.acknowledged_at);
        if (added.length === 0 && !changed && all[deviceId]) return all;
        const merged = existing.map((x) => byId.get(x.id) ?? x);
        return { ...all, [deviceId]: [...added, ...merged].sort((a, b) => b.id - a.id) };
      });
      fresh.sort((a, b) => a.id - b.id).forEach((e) => onNewEventRef.current(e));
    };

    const applyDevices = (response: DevicesResponse) => {
      const first = response.devices[0];
      if (first) setClockOffsetMs(Date.parse(first.server_time) - Date.now());
      setDevices(response.devices);
      setLoaded(true);
    };

    const refresh = async () => {
      try {
        const [response, people] = await Promise.all([api.devices(), api.workers()]);
        if (disposed) return;
        applyDevices(response);
        setWorkers(people.workers);
        await Promise.all(
          response.devices.map(async (d) => mergeAlerts(d.device_id, (await api.alerts(d.device_id)).alerts)),
        );
        if (!disposed && !streamOpen) setConnection('polling');
      } catch {
        if (!disposed && !streamOpen) setConnection('down');
      }
    };

    void refresh();
    // Poll quickly while the stream is down, and only occasionally while it is healthy.
    let lastPoll = Date.now();
    const poll = setInterval(() => {
      if (streamOpen && Date.now() - lastPoll < POLL_SAFETY_MS) return;
      lastPoll = Date.now();
      void refresh();
    }, POLL_FAST_MS);

    let source: EventSource | null = null;
    if ('EventSource' in window) {
      source = new EventSource(routes.stream());
      source.addEventListener('open', () => {
        streamOpen = true;
        setConnection('live');
      });
      source.addEventListener('hello', (e) => {
        applyDevices(JSON.parse((e as MessageEvent).data));
        void refresh(); // catch up on alerts missed while disconnected
      });
      source.addEventListener('state', (e) => applyState(JSON.parse((e as MessageEvent).data)));
      source.addEventListener('alert', (e) => {
        const event = JSON.parse((e as MessageEvent).data) as SafetyEvent;
        if (seen.current[event.device_id] === undefined) seen.current[event.device_id] = event.id - 1;
        mergeAlerts(event.device_id, [event]);
      });
      source.addEventListener('alert_update', (e) => {
        const event = JSON.parse((e as MessageEvent).data) as SafetyEvent;
        mergeAlerts(event.device_id, [event]);
      });
      source.addEventListener('device_removed', (e) => removeDevice(JSON.parse((e as MessageEvent).data).device_id));
      source.addEventListener('worker', (e) => applyWorker(JSON.parse((e as MessageEvent).data)));
      source.addEventListener('worker_removed', (e) => removeWorker(JSON.parse((e as MessageEvent).data).worker_id));
      source.addEventListener('error', () => {
        // EventSource reconnects by itself; polling covers the gap
        streamOpen = false;
        setConnection((c) => (c === 'live' || c === 'connecting' ? 'polling' : c));
        void refresh();
      });
    }

    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      clearInterval(poll);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loaded, connection, devices, alerts, clockOffsetMs, applyState, applyEvent, removeDevice, workers, applyWorker, removeWorker };
}
