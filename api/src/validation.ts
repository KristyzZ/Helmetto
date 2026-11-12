import { z } from 'zod';
import { GEOFENCE_MAX_RADIUS_M, GEOFENCE_MIN_RADIUS_M, type ApiError } from '@helmetto/shared';

const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable().optional().transform((v) => v ?? null);

/**
 * Telemetry contract (shared/PROTOCOL.md). Unknown extra fields are ignored so
 * newer firmware keeps working against an older server.
 */
export const telemetrySchema = z.object({
  helmet_connected: z.boolean({
    required_error: 'helmet_connected is required',
    invalid_type_error: 'helmet_connected must be true or false',
  }),
  helmet_worn: nullable(z.boolean()),
  latitude: nullable(z.number().finite()),
  longitude: nullable(z.number().finite()),
  speed_kmh: nullable(z.number().finite().min(0).max(200)),
  battery_percent: nullable(z.number().finite().min(0).max(100)),
  crash_detected: nullable(z.boolean()),
});

export const geofenceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_m: z.number().min(GEOFENCE_MIN_RADIUS_M).max(GEOFENCE_MAX_RADIUS_M),
});

export function validationError(error: z.ZodError): ApiError {
  const details = error.issues.map((issue) => ({
    path: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
  return {
    error: 'invalid_payload',
    message: details.map((d) => `${d.path}: ${d.message}`).join('; '),
    details,
  };
}
