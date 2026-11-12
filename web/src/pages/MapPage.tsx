import { useState } from 'react';
import {
  GEOFENCE_MAX_RADIUS_M,
  GEOFENCE_MIN_RADIUS_M,
  type DeviceState,
  type Geofence,
} from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { MapView } from '../MapView';
import { rideAlerts } from '../status';
import { ago } from '../time';

const DEFAULT_RADIUS_M = 250;
const SLIDER_MAX_M = Math.min(2000, GEOFENCE_MAX_RADIUS_M);

export function MapPage(props: {
  device: DeviceState;
  serverNow: number;
  onSaved: (state: DeviceState) => void;
}) {
  const { device, serverNow } = props;
  const [follow, setFollow] = useState(true);
  const [draft, setDraft] = useState<Geofence | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = device.telemetry;
  const hasGps = t?.latitude != null && t.longitude != null;
  const position = hasGps ? { latitude: t.latitude!, longitude: t.longitude! } : device.last_location;
  const stale = !hasGps || !device.online;

  const startEditing = () => {
    setError(null);
    setEditing(true);
    setFollow(false);
    // start from the saved zone, else centre a new one on the scooter
    setDraft(device.geofence ?? (position ? { ...position, radius_m: DEFAULT_RADIUS_M } : null));
  };

  const finish = async (action: () => Promise<DeviceState>) => {
    setBusy(true);
    setError(null);
    try {
      props.onSaved(await action());
      setEditing(false);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const locationLabel = !position
    ? 'Location unavailable'
    : stale
      ? `Location unavailable. Last known ${ago(device.last_location?.at ?? null, serverNow)}`
      : `Live location · updated ${ago(device.last_seen_at, serverNow)}`;

  return (
    <div className="map-page">
      <MapView
        position={position}
        stale={stale}
        tone={device.online && rideAlerts(device).length > 0 ? 'danger' : 'ok'}
        geofence={device.geofence}
        draft={editing ? draft : null}
        follow={follow && !editing}
        onUserMove={() => setFollow(false)}
        onPick={editing ? (latitude, longitude) => setDraft((d) => ({ latitude, longitude, radius_m: d?.radius_m ?? DEFAULT_RADIUS_M })) : undefined}
      />

      {!editing && (
        <>
          <div className={`map-status ${stale ? 'map-status--muted' : ''}`}>
            <i className={`dot dot--${stale ? 'muted' : 'ok'}`} />
            <span>{locationLabel}</span>
          </div>
          <div className="map-actions">
            {position && !follow && (
              <button className="fab" onClick={() => setFollow(true)} aria-label="Centre on scooter">
                <Icon name="target" />
              </button>
            )}
            <button className="button button--primary button--pill" onClick={startEditing}>
              <Icon name="zone" size={18} />
              {device.geofence ? 'Edit safe zone' : 'Set safe zone'}
            </button>
          </div>
        </>
      )}

      {editing && (
        <div className="sheet sheet--docked" role="dialog" aria-label="Safe zone">
          <div className="sheet__title">
            <strong>Safe zone</strong>
            <button className="icon-button" onClick={() => { setEditing(false); setDraft(null); }} aria-label="Cancel">
              <Icon name="close" size={20} />
            </button>
          </div>
          {!draft ? (
            <p className="muted">Tap the map where the centre of the safe zone should be.</p>
          ) : (
            <>
              <p className="muted">Tap the map to move the centre. You get an alert when the scooter leaves this circle.</p>
              <label className="slider">
                <span>Radius <strong>{draft.radius_m >= 1000 ? `${(draft.radius_m / 1000).toFixed(1)} km` : `${draft.radius_m} m`}</strong></span>
                <input
                  type="range"
                  min={GEOFENCE_MIN_RADIUS_M}
                  max={SLIDER_MAX_M}
                  step={10}
                  value={Math.min(draft.radius_m, SLIDER_MAX_M)}
                  onChange={(e) => setDraft({ ...draft, radius_m: Number(e.target.value) })}
                />
              </label>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <div className="sheet__actions">
            {device.geofence && (
              <button className="button button--ghost-danger" disabled={busy} onClick={() => finish(() => api.clearGeofence(device.device_id))}>
                Remove
              </button>
            )}
            <button
              className="button button--primary button--grow"
              disabled={busy || !draft}
              onClick={() => draft && finish(() => api.setGeofence(device.device_id, draft))}
            >
              {busy ? 'Saving…' : 'Save safe zone'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
