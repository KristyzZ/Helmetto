import { z } from 'zod';
import { enclosingCircle, isSimplePolygon, polygonAreaM2 } from '@helmetto/ai';
import {
  GEOFENCE_MAX_POINTS,
  GEOFENCE_MAX_RADIUS_M,
  GEOFENCE_MIN_AREA_M2,
  GEOFENCE_MIN_POINTS,
  GEOFENCE_MIN_RADIUS_M,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  type ApiError,
  type Geofence,
} from '@helmetto/shared';

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

const circleSchema = z.object({
  shape: z.literal('circle').optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_m: z.number().min(GEOFENCE_MIN_RADIUS_M).max(GEOFENCE_MAX_RADIUS_M),
});

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const polygonSchema = z.object({
  shape: z.literal('polygon'),
  points: z
    .array(pointSchema)
    .min(GEOFENCE_MIN_POINTS, `a drawn zone needs at least ${GEOFENCE_MIN_POINTS} points`)
    .max(GEOFENCE_MAX_POINTS, `a drawn zone can have at most ${GEOFENCE_MAX_POINTS} points`)
    .superRefine((points, ctx) => {
      if (points.length < GEOFENCE_MIN_POINTS) return;
      if (!isSimplePolygon(points)) {
        ctx.addIssue({ code: 'custom', message: 'the shape crosses itself or repeats a point; its lines must not cross' });
      } else if (polygonAreaM2(points) < GEOFENCE_MIN_AREA_M2) {
        ctx.addIssue({ code: 'custom', message: `the zone is too small (minimum ${GEOFENCE_MIN_AREA_M2} m²)` });
      }
    }),
});

/**
 * PUT geofence body. A body without `shape` is a circle, exactly as before
 * polygons existed. The result is always the stored form: polygons get an
 * enclosing circle in the circle fields for clients that only draw circles.
 */
export const geofenceSchema = z
  .union([polygonSchema, circleSchema])
  .transform((input): Geofence =>
    input.shape === 'polygon'
      ? { ...enclosingCircle(input.points), shape: 'polygon', points: input.points }
      : { latitude: input.latitude, longitude: input.longitude, radius_m: input.radius_m, shape: 'circle' },
  );

const nameSchema = z.string().trim().min(1, 'must not be empty').max(NAME_MAX_LENGTH);

const phoneSchema = z
  .string()
  .trim()
  .max(PHONE_MAX_LENGTH)
  .regex(/^\+?[0-9][0-9 ()-]{2,}$/, 'use digits, spaces, +, -, ( and ) only');

export const deviceUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    child_name: z
      .union([nameSchema, z.literal(''), z.null()])
      .transform((v) => v || null)
      .optional(),
    child_phone: z
      .union([phoneSchema, z.literal(''), z.null()])
      .transform((v) => v || null)
      .optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.child_name !== undefined || v.child_phone !== undefined,
    'send name, child_name and/or child_phone',
  );

export const acknowledgeSchema = z.object({
  by: z
    .union([nameSchema, z.literal(''), z.null()])
    .transform((v) => v || null)
    .optional(),
});

export function validationError(error: z.ZodError): ApiError {
  // For a union (circle | polygon) report the branch the client was aiming for.
  const issues = error.issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union') return [issue];
    const branches = issue.unionErrors.map((e) => e.issues);
    const notShape = branches.filter((b) => !b.some((i) => i.path[0] === 'shape'));
    return (notShape[0] ?? branches[branches.length - 1] ?? [issue]) as z.ZodIssue[];
  });
  const details = issues.map((issue) => ({
    path: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
  return {
    error: 'invalid_payload',
    message: details.map((d) => `${d.path}: ${d.message}`).join('; '),
    details,
  };
}
