import { useEffect, useRef, useState } from 'react';
import { routes, type DeviceState, type DevicesResponse, type SafetyEvent } from '@helmetto/shared';
import { API_BASE, api } from './api';

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
  /** Apply a changed event (e.g. acknowledged) without waiting for the stream. */
  applyEvent: (event: SafetyEvent) => void;
  /**
   * When the devices and alerts on screen were saved, if they come from this
   * phone's copy because the server hasn't answered yet; null once it has.
   */
  cachedAt: string | null;
}

const CACHE_KEY = 'helmetto.cache.v1';
interface Cache {
  devices: DeviceState[];
  alerts: Record<string, SafetyEvent[]>;
  savedAt: string;
}

/** The last status this phone received, so the app can show it while offline. */
function readCache(): Cache | null {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cache | null;
    return cache && Array.isArray(cache.devices) ? cache : null;
  } catch {
    return null;
  }
}

function writeCache(devices: DeviceState[], alerts: Record<string, SafetyEvent[]>) {
  try {
    const trimmed = Object.fromEntries(Object.entries(alerts).map(([id, list]) => [id, list.slice(0, 50)]));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ devices, alerts: trimmed, savedAt: new Date().toISOString() } satisfies Cache));
  } catch {
    // storage full or blocked: the app still works, just without an offline copy
  }
}

const POLL_FAST_MS = 4_000; // while the stream is down
const POLL_SAFETY_MS = 20_000; // belt and braces while the stream is up
const STREAM_RETRY_MS = 5_000; // reopen the live stream after the browser gave up on it

/** Keeps device state and alert history in sync: SSE first, polling as fallback. */
export function useLive(onNewEvent: (event: SafetyEvent) => void): Live {
  const [cache] = useState(readCache);
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [devices, setDevices] = useState<DeviceState[]>(cache?.devices ?? []);
  const [alerts, setAlerts] = useState<Record<string, SafetyEvent[]>>(cache?.alerts ?? {});
  const [cachedAt, setCachedAt] = useState<string | null>(cache?.savedAt ?? null);
  /** True until the server answers; then the saved copy is dropped, not merged (the server may have been reset). */
  const showingCache = useRef(cache !== null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

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

  /** Replace an event we already have, e.g. after someone pressed "I'm on it". Never a new-alert toast. */
  const applyEvent = (event: SafetyEvent) => {
    setAlerts((all) => {
      const list = all[event.device_id];
      if (!list?.some((e) => e.id === event.id)) return all;
      return { ...all, [event.device_id]: list.map((e) => (e.id === event.id ? event : e)) };
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
        const ids = new Set(existing.map((e) => e.id));
        const added = incoming.filter((e) => !ids.has(e.id));
        // Polling also brings acknowledgements made on another phone.
        const changed = existing.some((e) => byId.has(e.id) && byId.get(e.id)!.acknowledged_at !== e.acknowledged_at);
        if (added.length === 0 && !changed && all[deviceId]) return all;
        const kept = existing.map((e) => byId.get(e.id) ?? e);
        return { ...all, [deviceId]: [...added, ...kept].sort((a, b) => b.id - a.id) };
      });
      fresh.sort((a, b) => a.id - b.id).forEach((e) => onNewEventRef.current(e));
    };

    const applyDevices = (response: DevicesResponse) => {
      if (showingCache.current) {
        showingCache.current = false;
        setCachedAt(null);
        setAlerts({});
      }
      const first = response.devices[0];
      if (first) setClockOffsetMs(Date.parse(first.server_time) - Date.now());
      setDevices(response.devices);
      setLoaded(true);
    };

    const refresh = async () => {
      try {
        const response = await api.devices();
        if (disposed) return;
        applyDevices(response);
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
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      source = new EventSource(API_BASE + routes.stream());
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
      source.addEventListener('alert_update', (e) => applyEvent(JSON.parse((e as MessageEvent).data) as SafetyEvent));
      source.addEventListener('error', () => {
        // Polling covers the gap. EventSource retries by itself after a dropped
        // connection, but gives up for good if the server was unreachable or
        // answered with an error (e.g. the app started before the server): then
        // open a new one shortly, or the app would never get back to "Live".
        streamOpen = false;
        setConnection((c) => (c === 'live' || c === 'connecting' ? 'polling' : c));
        void refresh();
        if (source?.readyState === EventSource.CLOSED && !disposed) {
          clearTimeout(reconnect);
          reconnect = setTimeout(() => !disposed && connect(), STREAM_RETRY_MS);
        }
      });
    };
    if ('EventSource' in window) connect();

    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(reconnect);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the offline copy up to date, but only with what the server sent.
  useEffect(() => {
    if (loaded) writeCache(devices, alerts);
  }, [loaded, devices, alerts]);

  return { loaded, connection, devices, alerts, clockOffsetMs, applyState, applyEvent, cachedAt };
}
