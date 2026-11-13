import { useState } from 'react';
import { isSimplePolygon, polygonAreaM2 } from '@helmetto/ai';
import {
  GEOFENCE_MAX_POINTS,
  GEOFENCE_MAX_RADIUS_M,
  GEOFENCE_MIN_AREA_M2,
  GEOFENCE_MIN_POINTS,
  GEOFENCE_MIN_RADIUS_M,
  type DeviceState,
  type GeoPoint,
  type GeofenceInput,
} from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { MapView, type Draft } from '../MapView';
import { location, locationLabel, visibleAlerts, zoneLabel } from '../status';

const DEFAULT_RADIUS_M = 250;
const SLIDER_MAX_M = Math.min(2000, GEOFENCE_MAX_RADIUS_M);

const formatRadius = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** What is wrong with the draft, as a short hint; null = ready to save. */
function problem(draft: Draft): { text: string; invalid: boolean } | null {
  if (draft.shape === 'circle') return draft.center ? null : { text: 'Tap the map to set the centre', invalid: false };
  const n = draft.points.length;
  if (n === 0) return { text: 'Tap the map to add corners', invalid: false };
  if (n < GEOFENCE_MIN_POINTS) return { text: `Add ${GEOFENCE_MIN_POINTS - n} more corner${GEOFENCE_MIN_POINTS - n > 1 ? 's' : ''}`, invalid: false };
  if (!isSimplePolygon(draft.points)) return { text: "Lines can't cross. Move a corner.", invalid: true };
  if (polygonAreaM2(draft.points) < GEOFENCE_MIN_AREA_M2) return { text: 'Area is too small', invalid: true };
  return null;
}

export function MapPage(props: { device: DeviceState; serverNow: number; onSaved: (state: DeviceState) => void }) {
  const { device, serverNow } = props;
  const [follow, setFollow] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Earlier versions of the drawn shape, for undo. */
  const [history, setHistory] = useState<GeoPoint[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { position, live } = location(device);
  const zone = zoneLabel(device);
  const saved = device.geofence;
  const issue = draft ? problem(draft) : null;
  const here: GeoPoint | null = position ? { lat: position.latitude, lon: position.longitude } : null;

  const polygonDraft = (): Draft => ({ shape: 'polygon', points: saved?.shape === 'polygon' ? (saved.points ?? []) : [] });
  const circleDraft = (): Draft =>
    saved && saved.shape !== 'polygon'
      ? { shape: 'circle', center: { lat: saved.latitude, lon: saved.longitude }, radius_m: saved.radius_m }
      : { shape: 'circle', center: here, radius_m: DEFAULT_RADIUS_M };

  const start = () => {
    setError(null);
    setHistory([]);
    setFollow(false);
    setDraft(saved && saved.shape !== 'polygon' ? circleDraft() : polygonDraft());
  };
  const stop = () => {
    setDraft(null);
    setHistory([]);
    setError(null);
  };

  const change = (next: Draft) => {
    setError(null);
    if (next.shape === 'polygon') {
      if (next.points.length > GEOFENCE_MAX_POINTS) return;
      if (draft?.shape === 'polygon') setHistory((h) => [...h, draft.points]);
    }
    setDraft(next);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setDraft({ shape: 'polygon', points: previous });
  };

  const finish = async (action: () => Promise<DeviceState>) => {
    setBusy(true);
    setError(null);
    try {
      props.onSaved(await action());
      stop();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!draft || issue) return;
    const body: GeofenceInput =
      draft.shape === 'polygon'
        ? { shape: 'polygon', points: draft.points }
        : { shape: 'circle', latitude: draft.center!.lat, longitude: draft.center!.lon, radius_m: draft.radius_m };
    void finish(() => api.setGeofence(device.device_id, body));
  };

  return (
    <div className="map-page">
      <MapView
        position={position}
        stale={!live}
        alert={device.online && visibleAlerts(device).length > 0}
        zone={saved}
        zoneTone={zone.tone === 'warn' ? 'unknown' : zone.tone}
        draft={draft}
        draftInvalid={issue?.invalid}
        onDraftChange={change}
        follow={follow && !draft}
        onUserMove={() => setFollow(false)}
      />

      {!draft && (
        <>
          <div className="map-top">
            <span className="pill"><i className={`dot tone-${live ? 'ok' : 'unknown'}`} />{locationLabel(device, serverNow)}</span>
            {/* an exit is already announced by the alert strip above the map */}
            {saved && zone.tone !== 'alert' && <span className="pill"><i className={`dot tone-${zone.tone}`} />{zone.text}</span>}
          </div>
          <div className="map-bottom">
            {position && !follow && (
              <button className="fab" onClick={() => setFollow(true)} aria-label="Centre on equipment">
                <Icon name="target" />
              </button>
            )}
            <button className="button button--primary button--float" onClick={start}>
              <Icon name="draw" size={18} />
              {saved ? 'Edit work area' : 'Draw work area'}
            </button>
          </div>
        </>
      )}

      {draft && (
        <div className="editor" role="dialog" aria-label="Work area">
          <div className="editor__head">
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={draft.shape === 'polygon'} onClick={() => { setHistory([]); setDraft(polygonDraft()); }}>
                <Icon name="draw" size={16} /> Draw
              </button>
              <button role="tab" aria-selected={draft.shape === 'circle'} onClick={() => { setHistory([]); setDraft(circleDraft()); }}>
                <Icon name="zone" size={16} /> Circle
              </button>
            </div>
            <button className="icon-button" onClick={stop} aria-label="Cancel">
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="editor__status">
            <p className={`editor__hint ${issue?.invalid || error ? 'editor__hint--bad' : ''}`} role="status">
              {error ?? issue?.text ?? (draft.shape === 'polygon' ? 'Drag corners. Tap + to add one.' : 'Tap the map or drag the dot.')}
            </p>
            {saved && (
              <button className="text-button text-button--danger" disabled={busy} onClick={() => finish(() => api.clearGeofence(device.device_id))}>
                Remove area
              </button>
            )}
          </div>

          {draft.shape === 'circle' && (
            <label className="slider">
              <span>Radius</span>
              <input
                type="range"
                min={GEOFENCE_MIN_RADIUS_M}
                max={SLIDER_MAX_M}
                step={10}
                value={Math.min(draft.radius_m, SLIDER_MAX_M)}
                onChange={(e) => change({ ...draft, radius_m: Number(e.target.value) })}
              />
              <strong>{formatRadius(draft.radius_m)}</strong>
            </label>
          )}

          <div className="editor__actions">
            {draft.shape === 'polygon' && (
              <>
                <button className="button" disabled={history.length === 0} onClick={undo}>
                  <Icon name="undo" size={18} /> Undo
                </button>
                <button className="button" disabled={draft.points.length === 0} onClick={() => change({ shape: 'polygon', points: [] })}>
                  Clear
                </button>
              </>
            )}
            <button className="button button--primary button--grow" disabled={busy || !!issue} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
