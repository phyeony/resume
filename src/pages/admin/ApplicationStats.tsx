import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { appliedPerWeek, bySource, type SourceRow } from '../../applications/stats';
import { useOwnerData } from './Admin';
import './applications.css';

const WEEKS = 12;

/** How many applications go out each week, and which sources get answers. */
export function ApplicationStats() {
  const { applications } = useOwnerData();
  const navigate = useNavigate();
  const weeks = useMemo(() => appliedPerWeek(applications, WEEKS), [applications]);
  const sources = useMemo(() => bySource(applications), [applications]);
  const total = sumRows(sources);

  return (
    <div className="pad">
      <div className="page-head">
        <button className="link" onClick={() => navigate('/admin/applications')}>
          ← Applications
        </button>
        <h1>Stats</h1>
      </div>

      {total.applied === 0 ? (
        <p className="muted">Nothing sent yet. Stats count applications from the day they're marked Applied.</p>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile label="Applied" value={String(total.applied)} />
            <Tile label="Got an answer" value={pct(total.replied, total.applied)} sub={`${total.replied} of ${total.applied}`} />
            <Tile label="Reached interviews" value={pct(total.interviews, total.applied)} sub={`${total.interviews} of ${total.applied}`} />
            <Tile label="Offers" value={String(total.offers)} />
          </div>

          <section className="card">
            <h2>Applied per week</h2>
            <WeekBars weeks={weeks} />
          </section>

          <section className="card">
            <h2>By source</h2>
            <p className="muted small">
              Set "Found via" on each application to see which sources are worth your time. A rejection counts as an
              answer.
            </p>
            <div className="table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Applied</th>
                    <th>Answered</th>
                    <th>Interviews</th>
                    <th>Offers</th>
                    <th>Typical wait</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((r) => (
                    <tr key={r.source}>
                      <td>{r.source}</td>
                      <td>{r.applied}</td>
                      <td>
                        {r.replied} <span className="muted">({pct(r.replied, r.applied)})</span>
                      </td>
                      <td>
                        {r.interviews} <span className="muted">({pct(r.interviews, r.applied)})</span>
                      </td>
                      <td>{r.offers}</td>
                      <td>{r.medianReplyDays === null ? '—' : `${r.medianReplyDays} day${r.medianReplyDays === 1 ? '' : 's'}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat-tile">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

/** One bar per week; hover a week for its count. */
function WeekBars({ weeks }: { weeks: { week: number; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const avg = weeks.reduce((n, w) => n + w.count, 0) / weeks.length;
  const label = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <>
      <p className="muted small">
        {weeks[weeks.length - 1].count} this week · {avg.toFixed(1)} a week on average over the last {weeks.length} weeks
      </p>
      <div className="week-bars" role="img" aria-label={weeks.map((w) => `Week of ${label(w.week)}: ${w.count}`).join(', ')}>
        {weeks.map((w) => (
          <div key={w.week} className="week-col" data-tip={`Week of ${label(w.week)}: ${w.count} applied`}>
            <div className="week-bar" style={{ height: `${(w.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="week-axis muted small">
        <span>{label(weeks[0].week)}</span>
        <span>This week</span>
      </div>
    </>
  );
}

function sumRows(rows: SourceRow[]) {
  return rows.reduce(
    (t, r) => ({ applied: t.applied + r.applied, replied: t.replied + r.replied, interviews: t.interviews + r.interviews, offers: t.offers + r.offers }),
    { applied: 0, replied: 0, interviews: 0, offers: 0 },
  );
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
