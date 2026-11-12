import type { Stats } from './status';

/**
 * Alerts per day for the last seven days: one series, so one colour and no legend.
 * Hover or focus a bar for its exact count; today's bar carries a direct label.
 */
export function WeekChart({ stats }: { stats: Stats }) {
  // an even top keeps the halfway gridline on a whole number
  const max = Math.ceil(Math.max(4, ...stats.days.map((d) => d.count)) / 2) * 2;
  const summary = stats.days.map((d) => `${d.label}: ${d.count}`).join(', ');

  return (
    <figure className="week">
      <div className="week__plot" role="img" aria-label={`Alerts per day. ${summary}`}>
        <span className="week__grid" style={{ bottom: '100%' }}><small>{max}</small></span>
        <span className="week__grid" style={{ bottom: '50%' }}><small>{max / 2}</small></span>
        {stats.days.map((day) => (
          <span
            key={day.start}
            className={`week__col ${day.today ? 'week__col--today' : ''}`}
            data-tip={`${day.count} alert${day.count === 1 ? '' : 's'}`}
            tabIndex={0}
          >
            {day.count > 0 ? (
              <span className="week__bar" style={{ height: `${(day.count / max) * 100}%` }}>
                {day.today && <b className="week__value">{day.count}</b>}
              </span>
            ) : (
              <span className="week__stub" />
            )}
          </span>
        ))}
      </div>
      <figcaption className="week__axis" aria-hidden="true">
        {stats.days.map((day) => (
          <span key={day.start} className={day.today ? 'is-today' : ''}>{day.today ? 'Today' : day.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}
