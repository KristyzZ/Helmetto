import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { GeoPoint, Geofence } from '@helmetto/shared';

/** The zone being edited. */
export type Draft =
  | { shape: 'polygon'; points: GeoPoint[] }
  | { shape: 'circle'; center: GeoPoint | null; radius_m: number };

export interface MapViewProps {
  /** Scooter position; null = location unavailable. */
  position: { latitude: number; longitude: number } | null;
  /** Position is a last-known one (no current GPS, or scooter offline). */
  stale?: boolean;
  /** Marker colour follows the device status. */
  alert?: boolean;
  /** Name shown as an initial inside the marker. */
  label?: string;
  /** Saved safe zone, hidden while a draft is being edited. */
  zone: Geofence | null;
  zoneTone?: 'ok' | 'alert' | 'unknown';
  draft?: Draft | null;
  /** Draw the draft in the alert colour (e.g. its lines cross). */
  draftInvalid?: boolean;
  onDraftChange?: (draft: Draft) => void;
  /** Keep the scooter centred as it moves. */
  follow?: boolean;
  onUserMove?: () => void;
  interactive?: boolean;
}

const DEFAULT_CENTER: L.LatLngTuple = [54.6872, 25.2797];

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toLatLng = (p: GeoPoint): L.LatLngTuple => [p.lat, p.lon];

const handle = (kind: 'corner' | 'mid' | 'center') =>
  L.divIcon({ className: '', html: `<div class="handle handle--${kind}"><i></i></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });

function zoneLayer(zone: Geofence, style: L.PathOptions): L.Path {
  return zone.shape === 'polygon' && zone.points
    ? L.polygon(zone.points.map(toLatLng), style)
    : L.circle([zone.latitude, zone.longitude], { ...style, radius: zone.radius_m });
}

/** Thin React wrapper around a Leaflet map with OpenStreetMap tiles. */
export function MapView(props: MapViewProps) {
  const { position, stale, alert, label, zone, zoneTone = 'unknown', draft, draftInvalid, follow, interactive = true } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const zoneRef = useRef<L.Path | null>(null);
  const draftLayers = useRef<L.LayerGroup | null>(null);
  const live = useRef(props);
  live.current = props;

  // create the map once
  useEffect(() => {
    const start: L.LatLngTuple = position
      ? [position.latitude, position.longitude]
      : zone
        ? [zone.latitude, zone.longitude]
        : DEFAULT_CENTER;
    const instance = L.map(container.current!, {
      center: start,
      zoom: position || zone ? 16 : 13,
      zoomControl: false,
      attributionControl: interactive,
      zoomSnap: 0.5,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
    });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance);
    if (interactive) L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom in', zoomOutTitle: 'Zoom out' }).addTo(instance);
    instance.attributionControl?.setPrefix(false);
    draftLayers.current = L.layerGroup().addTo(instance);

    // a tap on the map adds a corner (polygon) or moves the centre (circle)
    instance.on('click', (e) => {
      const { draft: current, onDraftChange } = live.current;
      if (!current || !onDraftChange) return;
      const point = { lat: e.latlng.lat, lon: e.latlng.lng };
      if (current.shape === 'polygon') onDraftChange({ ...current, points: [...current.points, point] });
      else onDraftChange({ ...current, center: point });
    });
    instance.on('dragstart', () => live.current.onUserMove?.());
    map.current = instance;

    // the container often gets its final size after first paint
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      marker.current = null;
      zoneRef.current = null;
      draftLayers.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scooter marker
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!position) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const initial = label?.trim().charAt(0).toUpperCase() ?? '';
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin pin--${stale ? 'stale' : alert ? 'alert' : 'ok'}"><span class="pin__halo"></span><b>${escapeHtml(initial)}</b></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    const latlng: L.LatLngTuple = [position.latitude, position.longitude];
    if (!marker.current) {
      marker.current = L.marker(latlng, { icon, interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(instance);
    } else {
      marker.current.setLatLng(latlng);
      marker.current.setIcon(icon);
    }
    if (follow) instance.panTo(latlng, { animate: true, duration: 0.8 });
  }, [position?.latitude, position?.longitude, stale, alert, follow, label]);

  // saved safe zone
  const zoneKey = zone ? JSON.stringify(zone) : '';
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    zoneRef.current?.remove();
    zoneRef.current = null;
    if (zone && !draft) {
      const color = css(zoneTone === 'unknown' ? '--accent' : `--${zoneTone}-solid`);
      zoneRef.current = zoneLayer(zone, {
        color,
        weight: 2.5,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(instance);
    }
  }, [zoneKey, zoneTone, !!draft]);

  // fit the map to the zone when editing starts
  const editing = !!draft;
  useEffect(() => {
    const instance = map.current;
    if (!instance || !editing) return;
    const current = live.current.draft!;
    const bounds =
      current.shape === 'polygon'
        ? current.points.length >= 2 ? L.latLngBounds(current.points.map(toLatLng)) : null
        : current.center ? L.latLng(toLatLng(current.center)).toBounds(current.radius_m * 2) : null;
    if (bounds) instance.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  }, [editing]);

  // the zone being edited: filled shape plus draggable handles
  const draftKey = draft ? JSON.stringify(draft) : '';
  useEffect(() => {
    const group = draftLayers.current;
    const instance = map.current;
    if (!group || !instance) return;
    group.clearLayers();
    if (!draft) return;
    const color = css(draftInvalid ? '--alert-solid' : '--accent');
    const style: L.PathOptions = { color, weight: 2.5, dashArray: '2 7', fillColor: color, fillOpacity: 0.14, interactive: false };
    const change = (next: Draft) => live.current.onDraftChange?.(next);

    if (draft.shape === 'circle') {
      if (!draft.center) return;
      const circle = L.circle(toLatLng(draft.center), { ...style, radius: draft.radius_m }).addTo(group);
      const center = L.marker(toLatLng(draft.center), { icon: handle('center'), draggable: true, keyboard: false }).addTo(group);
      center.on('drag', () => circle.setLatLng(center.getLatLng()));
      center.on('dragend', () => {
        const { lat, lng } = center.getLatLng();
        change({ ...draft, center: { lat, lon: lng } });
      });
      return;
    }

    const points = draft.points;
    const latlngs = points.map(toLatLng);
    const shape = points.length >= 3 ? L.polygon(latlngs, style) : L.polyline(latlngs, { ...style, fill: false });
    shape.addTo(group);

    // "+" handles in the middle of each side: tap to add a corner there
    const mids = L.layerGroup().addTo(group);
    if (points.length >= 2) {
      const sides = points.length >= 3 ? points.length : 1;
      for (let i = 0; i < sides; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
        L.marker(toLatLng(mid), { icon: handle('mid'), keyboard: false })
          .on('click', () => change({ shape: 'polygon', points: [...points.slice(0, i + 1), mid, ...points.slice(i + 1)] }))
          .addTo(mids);
      }
    }

    // corner handles: drag to move
    points.forEach((point, index) => {
      const corner = L.marker(toLatLng(point), { icon: handle('corner'), draggable: true, keyboard: false, zIndexOffset: 200 }).addTo(group);
      corner.on('dragstart', () => mids.remove());
      corner.on('drag', () => {
        const { lat, lng } = corner.getLatLng();
        latlngs[index] = [lat, lng];
        (shape as L.Polyline).setLatLngs(latlngs);
      });
      corner.on('dragend', () => {
        const { lat, lng } = corner.getLatLng();
        change({ shape: 'polygon', points: points.map((p, i) => (i === index ? { lat, lon: lng } : p)) });
      });
    });
  }, [draftKey, draftInvalid]);

  // Leaflet adds its own classes to its container, so React must never rewrite
  // that element's className: the state class goes on a wrapper.
  return (
    <div className={`map ${draft ? 'map--drawing' : ''}`}>
      <div ref={container} className="map__canvas" />
    </div>
  );
}
