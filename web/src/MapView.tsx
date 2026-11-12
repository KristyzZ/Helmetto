import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { Geofence } from '@helmetto/shared';

export interface MapViewProps {
  /** Scooter position; null = location unavailable. */
  position: { latitude: number; longitude: number } | null;
  /** Position is a last-known one (no current GPS, or scooter offline). */
  stale?: boolean;
  /** Marker colour follows the device status. */
  tone?: 'ok' | 'danger' | 'muted';
  geofence: Geofence | null;
  /** Unsaved zone while the parent is editing. */
  draft?: Geofence | null;
  /** Called with the tapped point (zone editing). */
  onPick?: (latitude: number, longitude: number) => void;
  /** Keep the scooter centred as it moves. */
  follow?: boolean;
  onUserMove?: () => void;
  interactive?: boolean;
  /** Where to open the map when nothing else is known. */
  fallbackCenter?: { latitude: number; longitude: number };
}

const DEFAULT_CENTER = { latitude: 54.6872, longitude: 25.2797 };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Thin React wrapper around a Leaflet map with OpenStreetMap tiles. */
export function MapView(props: MapViewProps) {
  const { position, stale, tone = 'ok', geofence, draft, onPick, follow, onUserMove, interactive = true } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const zone = useRef<L.Circle | null>(null);
  const draftZone = useRef<L.Circle | null>(null);
  const draftCenter = useRef<L.CircleMarker | null>(null);
  const callbacks = useRef({ onPick, onUserMove });
  callbacks.current = { onPick, onUserMove };

  // create the map once
  useEffect(() => {
    const start = position ?? draft ?? geofence ?? props.fallbackCenter ?? DEFAULT_CENTER;
    const instance = L.map(container.current!, {
      center: [start.latitude, start.longitude],
      zoom: position || geofence ? 16 : 13,
      zoomControl: false,
      attributionControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    instance.on('click', (e) => callbacks.current.onPick?.(e.latlng.lat, e.latlng.lng));
    instance.on('dragstart', () => callbacks.current.onUserMove?.());
    map.current = instance;

    // the container often gets its final size after first paint
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      marker.current = null;
      zone.current = null;
      draftZone.current = null;
      draftCenter.current = null;
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
    const icon = L.divIcon({
      className: '',
      html: `<div class="scooter-pin scooter-pin--${stale ? 'muted' : tone}"><span></span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const latlng: L.LatLngExpression = [position.latitude, position.longitude];
    if (!marker.current) {
      marker.current = L.marker(latlng, { icon, interactive: false, keyboard: false }).addTo(instance);
    } else {
      marker.current.setLatLng(latlng);
      marker.current.setIcon(icon);
    }
    if (follow) instance.panTo(latlng, { animate: true, duration: 0.8 });
  }, [position?.latitude, position?.longitude, stale, tone, follow]);

  // saved safe zone
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    zone.current?.remove();
    zone.current = null;
    if (geofence && !draft) {
      zone.current = L.circle([geofence.latitude, geofence.longitude], {
        radius: geofence.radius_m,
        color: css('--accent'),
        weight: 2,
        fillColor: css('--accent'),
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(instance);
    }
  }, [geofence?.latitude, geofence?.longitude, geofence?.radius_m, !!draft]);

  // zone being edited
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    draftZone.current?.remove();
    draftCenter.current?.remove();
    draftZone.current = null;
    draftCenter.current = null;
    if (draft) {
      const center: L.LatLngExpression = [draft.latitude, draft.longitude];
      draftZone.current = L.circle(center, {
        radius: draft.radius_m,
        color: css('--accent'),
        weight: 2.5,
        dashArray: '8 8',
        fillColor: css('--accent'),
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(instance);
      draftCenter.current = L.circleMarker(center, {
        radius: 5,
        color: '#fff',
        weight: 2,
        fillColor: css('--accent'),
        fillOpacity: 1,
        interactive: false,
      }).addTo(instance);
      instance.fitBounds(draftZone.current.getBounds(), { padding: [32, 32], maxZoom: 17 });
    }
  }, [draft?.latitude, draft?.longitude, draft?.radius_m]);

  return <div ref={container} className="map" />;
}
