import { isValidCoordinate } from '@helmetto/ai';
import { z } from 'zod';

interface AccessPoint {
  macAddress: string;
  signalStrength: number;
}

export async function locateWifi(accessPoints: AccessPoint[]) {
  const key = process.env.WIFI_GEOLOCATION_API_KEY;
  const points = new Map<string, AccessPoint>();
  for (const point of accessPoints) {
    const macAddress = point.macAddress.toLowerCase();
    if ((parseInt(macAddress.slice(0, 2), 16) & 3) !== 0) continue;
    points.set(macAddress, { ...point, macAddress });
  }
  if (!key || points.size < 2) return undefined;

  const url = new URL('https://www.googleapis.com/geolocation/v1/geolocate');
  url.searchParams.set('key', key);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ considerIp: false, wifiAccessPoints: [...points.values()] }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return undefined;

    const result = z.object({
      location: z.object({ lat: z.number(), lng: z.number() }),
      accuracy: z.number().finite().positive(),
    }).safeParse(await response.json());
    if (!result.success) return undefined;
    const { location: { lat: latitude, lng: longitude }, accuracy } = result.data;
    if (!isValidCoordinate(latitude, longitude)) return undefined;
    return { latitude, longitude, location_source: 'wifi' as const, location_accuracy_m: accuracy };
  } catch {
    return undefined;
  }
}
