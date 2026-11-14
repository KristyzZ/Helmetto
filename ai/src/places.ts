import { PLACE_LEAVE_MARGIN_M, type Place } from '@helmetto/shared';
import { haversineMeters, isValidCoordinate } from './geo';

/**
 * Which marked place a GPS reading is at, or null for none of them.
 *
 * `current` is the place the scooter was at before. It keeps counting as there
 * until the reading is PLACE_LEAVE_MARGIN_M beyond the edge, so GPS jitter at
 * the edge doesn't make it "arrive" again and again. Otherwise the nearest
 * place whose circle holds the reading wins (places can overlap).
 */
export function placeAt(
  places: readonly Place[],
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  current: number | null,
): number | null {
  if (!isValidCoordinate(latitude, longitude)) return current;
  const distance = (p: Place) => haversineMeters(p.latitude, p.longitude, latitude!, longitude!);
  const stay = current === null ? undefined : places.find((p) => p.id === current);
  if (stay && distance(stay) <= stay.radius_m + PLACE_LEAVE_MARGIN_M) return stay.id;
  let best: { id: number; d: number } | null = null;
  for (const place of places) {
    const d = distance(place);
    if (d <= place.radius_m && (!best || d < best.d)) best = { id: place.id, d };
  }
  return best?.id ?? null;
}
