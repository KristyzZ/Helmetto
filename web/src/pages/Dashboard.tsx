import type { DeviceState, SafetyEvent } from '@helmetto/shared';
import { EventRow } from './Alerts';
import { Icon, type IconName } from '../icons';
import { MapView } from '../MapView';
import { hasReported, rideAlerts, summarize, type Tone } from '../status';
import { ago } from '../time';

interface TileProps {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  tone: Tone;
}

function Tile({ icon, label, value, note, tone }: TileProps) {
  return (
    <div className={`tile tile--${tone}`}>
      <div className="tile__head">
        <span className="tile__icon"><Icon name={icon} size={18} /></span>
        <span className="tile__label">{label}</span>
      </div>
      <div className="tile__value">{value}</div>
      {note && <div className="tile__note">{note}</div>}
    </div>
  );
}

/** Tiles describe the latest reading. When the scooter is offline they are marked "last known". */
function tiles(device: DeviceState, serverNow: number): TileProps[] {
  const t = device.telemetry;
  const reported = hasReported(device);
  const live = device.online;
  const lastKnown = reported && !live ? 'Last known' : undefined;
  const dim = (tone: Tone): Tone => (live ? tone : 'muted');

  const scooter: TileProps = !reported
    ? { icon: 'scooter', label: 'Scooter', value: 'No data yet', tone: 'muted' }
    : live
      ? { icon: 'signal', label: 'Scooter', value: 'Online', note: `Updated ${ago(device.last_seen_at, serverNow)}`, tone: 'ok' }
      : { icon: 'signalOff', label: 'Scooter', value: 'Offline', note: `Last seen ${ago(device.last_seen_at, serverNow)}`, tone: 'warn' };

  const helmet: TileProps = !t
    ? { icon: 'helmet', label: 'Helmet link', value: 'Unknown', tone: 'muted' }
    : !live
      ? { icon: 'helmet', label: 'Helmet link', value: 'Unknown', note: `Was ${t.helmet_connected ? 'connected' : 'disconnected'} before going offline`, tone: 'muted' }
      : t.helmet_connected
        ? { icon: 'helmet', label: 'Helmet link', value: 'Connected', tone: 'ok' }
        : { icon: 'helmet', label: 'Helmet link', value: 'Disconnected', note: 'Scooter cannot hear the helmet', tone: 'danger' };

  const worn: TileProps =
    !t || t.helmet_worn === null || !live || !t.helmet_connected
      ? {
          icon: 'shield',
          label: 'Helmet worn',
          value: 'Unknown',
          note: !t || !live ? undefined : !t.helmet_connected ? 'Helmet not connected' : 'No wearing sensor',
          tone: 'muted',
        }
      : t.helmet_worn
        ? { icon: 'shield', label: 'Helmet worn', value: 'Worn', tone: 'ok' }
        : { icon: 'shield', label: 'Helmet worn', value: 'Not worn', tone: 'danger' };

  const speed: TileProps =
    t?.speed_kmh == null
      ? { icon: 'gauge', label: 'Speed', value: 'Unavailable', tone: 'muted' }
      : { icon: 'gauge', label: 'Speed', value: `${Math.round(t.speed_kmh)} km/h`, note: lastKnown, tone: dim('ok') };

  const battery: TileProps =
    t?.battery_percent == null
      ? { icon: 'battery', label: 'Battery', value: 'Unavailable', tone: 'muted' }
      : {
          icon: 'battery',
          label: 'Battery',
          value: `${Math.round(t.battery_percent)}%`,
          note: lastKnown ?? (t.battery_percent < 20 ? 'Low' : undefined),
          tone: dim(t.battery_percent < 20 ? 'warn' : 'ok'),
        };

  const zone: TileProps = !device.geofence
    ? { icon: 'zone', label: 'Safe zone', value: 'Not set', note: 'Set one on the map', tone: 'muted' }
    : device.active_alerts.includes('geofence_exit')
      ? { icon: 'zone', label: 'Safe zone', value: 'Outside', note: lastKnown, tone: dim('danger') }
      : device.zone_status === 'inside'
        ? { icon: 'zone', label: 'Safe zone', value: 'Inside', note: lastKnown, tone: dim('ok') }
        : { icon: 'zone', label: 'Safe zone', value: 'Unknown', note: 'No location', tone: 'muted' };

  return [scooter, helmet, worn, speed, battery, zone];
}

export function Dashboard(props: {
  device: DeviceState;
  events: SafetyEvent[];
  serverNow: number;
  onOpenMap: () => void;
  onOpenAlerts: () => void;
}) {
  const { device, events, serverNow } = props;
  const summary = summarize(device);
  const t = device.telemetry;
  const hasGps = t?.latitude != null && t.longitude != null;
  const position = hasGps ? { latitude: t.latitude!, longitude: t.longitude! } : device.last_location;
  const danger = device.online && rideAlerts(device).length > 0;

  return (
    <div className="page">
      <section className={`hero hero--${summary.tone}`} aria-live="polite">
        <div className="hero__badge"><Icon name={summary.icon} size={30} /></div>
        <div>
          <h1 className="hero__title">{summary.title}</h1>
          <p className="hero__detail">{summary.detail}</p>
          {hasReported(device) && (
            <p className="hero__time">Last update {ago(device.last_seen_at, serverNow)}</p>
          )}
        </div>
      </section>

      <section className="tiles">
        {tiles(device, serverNow).map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </section>

      <section className="card card--flush">
        <button className="card__header" onClick={props.onOpenMap}>
          <span>
            <strong>Location</strong>
            <small>
              {hasGps && device.online
                ? 'Live'
                : position
                  ? `Location unavailable. Last known ${ago(device.last_location?.at ?? null, serverNow)}`
                  : 'Location unavailable'}
            </small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        {position ? (
          <div className="minimap" onClick={props.onOpenMap}>
            <MapView
              position={position}
              stale={!hasGps || !device.online}
              tone={danger ? 'danger' : 'ok'}
              geofence={device.geofence}
              follow
              interactive={false}
            />
          </div>
        ) : (
          <div className="empty empty--inline">
            <Icon name="map" size={22} />
            <span>The scooter has not sent a GPS position yet.</span>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__title">
          <strong>Recent activity</strong>
          <button className="link" onClick={props.onOpenAlerts}>See all</button>
        </div>
        {events.length === 0 ? (
          <p className="muted">No alerts so far.</p>
        ) : (
          <ul className="events">
            {events.slice(0, 3).map((event) => (
              <EventRow key={event.id} event={event} serverNow={serverNow} compact />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
