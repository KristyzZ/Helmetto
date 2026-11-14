import { useState } from 'react';
import { isSimplePolygon, polygonAreaM2 } from '@helmetto/ai';
import {
  GEOFENCE_MAX_POINTS,
  GEOFENCE_MAX_RADIUS_M,
  GEOFENCE_MIN_AREA_M2,
  GEOFENCE_MIN_POINTS,
  GEOFENCE_MIN_RADIUS_M,
  NAME_MAX_LENGTH,
  PLACES_MAX,
  PLACE_MAX_RADIUS_M,
  PLACE_MIN_RADIUS_M,
  type DeviceState,
  type GeoPoint,
  type GeofenceInput,
} from '@helmetto/shared';
import { api } from '../api';
import { Icon } from '../icons';
import { MapView, type Draft } from '../MapView';
import { Sheet } from '../Sheet';
import { childName, location, locationLabel, visibleAlerts, zoneLabel } from '../status';

const DEFAULT_RADIUS_M = 250;
const SLIDER_MAX_M = Math.min(2000, GEOFENCE_MAX_RADIUS_M);

const PLACE_RADIUS_M = 80;
/** Quick names for a new place. */
const PLACE_NAMES = ['School', 'Home', "Grandma's", 'Club'];

/** A place being added: a name and a circle. */
type PlaceDraft = { name: string; center: GeoPoint | null; radius_m: number };

const formatRadius = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** What is wrong with the draft, as a short hint; null = ready to save. */
function problem(draft: Draft): { text: string; invalid: boolean } | null {
  if (draft.shape === 'circle') return draft.center ? null : { text: 'Tap the map to set the centre', invalid: false };
  const n = draft.points.length;
  if (n === 0) return { text: 'Tap the map to add corners', invalid: false };
  if (n < GEOFENCE_MIN_POINTS) return { text: `Add ${GEOFENCE_MIN_POINTS - n} more corner${GEOFENCE_MIN_POINTS - n > 1 ? 's' : ''}`, invalid: false };
  if (!isSimplePolygon(draft.points)) return { text: "Lines can't cross. Move a corner.", invalid: true };
  if (polygonAreaM2(draft.points) < GEOFENCE_MIN_AREA_M2) return { text: 'Zone is too small', invalid: true };
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
  const [placesOpen, setPlacesOpen] = useState(false);
  const [place, setPlace] = useState<PlaceDraft | null>(null);

  const { position, live } = location(device);
  const places = device.places ?? [];
  const child = childName(device);
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
  const addPlace = (name = '') => {
    setPlacesOpen(false);
    setError(null);
    setFollow(false);
    setPlace({ name, center: here, radius_m: PLACE_RADIUS_M });
  };
  const savePlace = async () => {
    if (!place?.center || !place.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      props.onSaved(
        await api.addPlace(device.device_id, {
          name: place.name.trim(),
          latitude: place.center.lat,
          longitude: place.center.lon,
          radius_m: place.radius_m,
        }),
      );
      setPlace(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const removePlace = async (id: number) => {
    setError(null);
    try {
      props.onSaved(await api.deletePlace(device.device_id, id));
    } catch (e) {
      setError((e as Error).message);
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
        places={places}
        atPlaceId={device.online ? device.at_place_id : null}
        keepZone={!!place}
        draft={place ? { shape: 'circle', center: place.center, radius_m: place.radius_m } : draft}
        draftInvalid={place ? false : issue?.invalid}
        onDraftChange={(next) => (place ? next.shape === 'circle' && setPlace({ ...place, center: next.center, radius_m: next.radius_m }) : change(next))}
        follow={follow && !draft && !place}
        onUserMove={() => setFollow(false)}
      />

      {!draft && !place && (
        <>
          <div className="map-top">
            <span className="pill"><i className={`dot tone-${live ? 'ok' : 'unknown'}`} />{locationLabel(device, serverNow)}</span>
            {/* an exit is already announced by the alert strip above the map */}
            {saved && zone.tone !== 'alert' && <span className="pill"><i className={`dot tone-${zone.tone}`} />{zone.text}</span>}
          </div>
          <div className="map-bottom">
            {position && !follow && (
              <button className="fab" onClick={() => setFollow(true)} aria-label="Centre on scooter">
                <Icon name="target" />
              </button>
            )}
            <div className="map-bottom__row">
              <button className="button button--float" onClick={() => setPlacesOpen(true)}>
                <Icon name="flag" size={18} />
                Places{places.length > 0 ? ` · ${places.length}` : ''}
              </button>
              <button className="button button--primary button--float" onClick={start}>
                <Icon name="draw" size={18} />
                {saved ? 'Edit zone' : 'Draw zone'}
              </button>
            </div>
          </div>
        </>
      )}

      {placesOpen && (
        <Sheet title="Places" icon="flag" onClose={() => setPlacesOpen(false)}>
          <p>
            Mark where {child ?? 'your child'} rides to. You get a notification when {child ?? 'they'}{' '}
            {child ? 'gets' : 'get'} there.
          </p>
          {places.length > 0 && (
            <ul className="list places">
              {places.map((p) => {
                const there = device.online && device.at_place_id === p.id;
                return (
                  <li key={p.id} className="row row--static">
                    <span className={`disc disc--sm disc--place ${there ? 'disc--here' : ''}`}><Icon name="flag" size={16} /></span>
                    <span className="row__text">
                      <strong>{p.name}</strong>
                      <small>{there ? `${child ?? 'The scooter'} is here now` : `${formatRadius(p.radius_m)} around the pin`}</small>
                    </span>
                    <button className="icon-button" onClick={() => removePlace(p.id)} aria-label={`Remove ${p.name}`}>
                      <Icon name="close" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="meta meta--bad">{error}</p>}
          {places.length < PLACES_MAX ? (
            <div className="sheet__actions">
              <button className="button button--primary" onClick={() => addPlace()}>
                <Icon name="flag" size={18} /> Add a place
              </button>
            </div>
          ) : (
            <p className="meta">That's the most places a scooter can have. Remove one to add another.</p>
          )}
        </Sheet>
      )}

      {place && (
        <div className="editor" role="dialog" aria-label="New place">
          <div className="editor__head">
            <strong className="editor__title">New place</strong>
            <button className="icon-button" onClick={() => { setPlace(null); setError(null); }} aria-label="Cancel">
              <Icon name="close" size={20} />
            </button>
          </div>
          <label className="field">
            <span>Name</span>
            <input
              value={place.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder="e.g. School"
              onChange={(e) => setPlace({ ...place, name: e.target.value })}
            />
          </label>
          <div className="quick-names">
            {PLACE_NAMES.map((name) => (
              <button key={name} className="quick-name" aria-pressed={place.name === name} onClick={() => setPlace({ ...place, name })}>
                {name}
              </button>
            ))}
          </div>
          <p className={`editor__hint ${error ? 'editor__hint--bad' : ''}`} role="status">
            {error ?? (place.center ? 'Tap the map or drag the dot to move it.' : 'Tap the map where it is.')}
          </p>
          <label className="slider">
            <span>Size</span>
            <input
              type="range"
              min={PLACE_MIN_RADIUS_M}
              max={PLACE_MAX_RADIUS_M}
              step={10}
              value={place.radius_m}
              onChange={(e) => setPlace({ ...place, radius_m: Number(e.target.value) })}
            />
            <strong>{formatRadius(place.radius_m)}</strong>
          </label>
          <div className="editor__actions">
            <button className="button button--primary button--grow" disabled={busy || !place.center || !place.name.trim()} onClick={savePlace}>
              {busy ? 'Saving…' : 'Save place'}
            </button>
          </div>
        </div>
      )}

      {draft && (
        <div className="editor" role="dialog" aria-label="Safe zone">
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
                Remove zone
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
