import { useEffect, useMemo, useState } from 'react';
import eventsUrl from '../../events/events.json?url';
import {
  DEFAULT_FILTER,
  KIND_LABELS,
  REGION_LABELS,
  RELEVANCE_LABELS,
  SORT_LABELS,
  calendarLink,
  matches,
  prepare,
  sortEvents,
  whenLabel,
  zoneOf,
  type DevEvent,
  type EventFilter,
  type EventSort,
  type EventsData,
  type Kind,
  type Region,
} from '../../events/events';
import './events.css';

const PAGE = 60;
const WITHIN: [number, string][] = [
  [0, 'Any time'],
  [7, 'Next 7 days'],
  [14, 'Next 2 weeks'],
  [31, 'Next month'],
];
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Dev and tech events in Vancouver, Seoul and online, sorted by when they are or by how much they can help you get hired. */
export function EventsPage() {
  const [data, setData] = useState<EventsData | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EventFilter>(() => ({ ...DEFAULT_FILTER, ...rememberedFilter() }));
  const [sort, setSort] = useState<EventSort>(() => (remembered('sort') as EventSort | null) ?? 'soonest');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    fetch(eventsUrl)
      .then((r) => (r.ok ? (r.json() as Promise<EventsData>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const events = useMemo(() => (data ? prepare(data.events) : []), [data]);
  const now = Date.now();
  const rows = sortEvents(
    events.filter((e) => matches(e, filter, now)),
    sort,
    now,
  );
  const high = rows.filter((e) => e.relevance >= 3).length;

  const update = (patch: Partial<EventFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    setShown(PAGE);
    const { search: _search, ...kept } = next;
    remember('filter', JSON.stringify(kept));
  };
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  return (
    <div className="pad events">
      <div className="page-head">
        <h1>Events</h1>
      </div>
      <p className="muted small">
        Meetups, hackathons, career fairs and workshops in Vancouver and Seoul
        {data && ` (Seoul through ${fmtDate(data.seoulUntil)})`}, plus virtual ones. Each is rated by how directly it can lead to an
        internship or new-grad offer.
      </p>

      <div className="events-controls">
        <div className="chips" role="group" aria-label="Where">
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <button key={r} className={`chip ${filter.regions.includes(r) ? 'on' : ''}`} onClick={() => update({ regions: toggle(filter.regions, r) })}>
              {REGION_LABELS[r]}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={filter.canadaOnly} onChange={(e) => update({ canadaOnly: e.target.checked })} />
          Virtual: Canadian only
        </label>
        <label className="grow-field">
          <input value={filter.search} placeholder="Search titles, hosts, places" onChange={(e) => update({ search: e.target.value })} />
        </label>
      </div>
      <div className="events-controls">
        <div className="chips" role="group" aria-label="Kind">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button key={k} className={`chip ${filter.kinds.includes(k) ? 'on' : ''}`} onClick={() => update({ kinds: toggle(filter.kinds, k) })}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="events-controls">
        <label>
          When
          <select value={filter.within} onChange={(e) => update({ within: Number(e.target.value) })}>
            {WITHIN.map(([d, label]) => (
              <option key={d} value={d}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Format
          <select value={filter.format} onChange={(e) => update({ format: e.target.value as EventFilter['format'] })}>
            <option value="any">In person or virtual</option>
            <option value="in-person">In person</option>
            <option value="online">Virtual</option>
          </select>
        </label>
        <label>
          Hiring value
          <select value={filter.minRelevance} onChange={(e) => update({ minRelevance: Number(e.target.value) })}>
            <option value={0}>Any</option>
            <option value={1}>Some or more</option>
            <option value={2}>Good or more</option>
            <option value={3}>High only</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as EventSort);
              remember('sort', e.target.value);
            }}
          >
            {(Object.keys(SORT_LABELS) as EventSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button className="link" onClick={() => update(DEFAULT_FILTER)}>
          Clear filters
        </button>
      </div>

      {error && <p className="error">Couldn't load the events: {error}</p>}
      {!data && !error && <p className="muted">Loading events…</p>}
      {data && (
        <>
          <p className="small">
            {rows.length} event{rows.length === 1 ? '' : 's'}
            {high > 0 && (
              <>
                {' · '}
                <span className="ok-text">{high} with high hiring value</span>
              </>
            )}
          </p>
          {rows.length === 0 && <p className="muted">Nothing matches. Try clearing a filter.</p>}
          <div className="event-list">
            {rows.slice(0, shown).map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </div>
          {rows.length > shown && (
            <button className="link" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </button>
          )}
          <Tips />
          <p className="muted small">
            Sources: {data.sources.join(', ')}. Luma, Meetup and Eventbrite listings were copied on {fmtDate(data.capturedAt)};
            run <code>python3 tools/events/build.py</code> after adding new ones to <code>tools/events/captured.json</code>. Times are the
            event's local time (for virtual events, Vancouver time, or Seoul time for Korean ones). Check the event page before you go: hosts change details.
          </p>
        </>
      )}
    </div>
  );
}

function EventRow({ e }: { e: DevEvent }) {
  const zone = zoneOf(e);
  const where = e.region === 'online' ? `Virtual${e.city ? ` · from ${e.city}` : ''}` : e.city || REGION_LABELS[e.region];
  return (
    <section className={`card event rel-${e.relevance}`}>
      <div className="event-head">
        <div className="grow">
          <a href={e.url} target="_blank" rel="noopener" className="event-title">
            {e.title}
          </a>
          <div className="small">
            {whenLabel(e)}
            {zone !== HERE && !e.allDay && <span className="muted"> · {new Intl.DateTimeFormat('en-CA', { timeZone: HERE, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(e.at)} your time</span>}
          </div>
          <div className="small muted">
            {where}
            {e.host && ` · ${e.host}`}
          </div>
        </div>
        <div className="event-badges">
          <span className={`badge rel rel-${e.relevance}`} title={e.reasons.join('; ')}>
            {RELEVANCE_LABELS[e.relevance]} hiring value
          </span>
          <span className="badge">{KIND_LABELS[e.kind]}</span>
          {e.online && e.region !== 'online' && <span className="badge">Also online</span>}
          {e.region === 'online' && e.audienceOf === 'ca' && <span className="badge">Canada</span>}
          {e.audienceOf === 'kr' && e.region === 'online' && <span className="badge">Korean</span>}
          {e.free === true && <span className="badge">Free</span>}
          {e.free === false && <span className="badge">Paid</span>}
        </div>
      </div>
      <div className="event-foot small">
        {e.reasons.length > 0 && <span className="muted">{capitalize(e.reasons.join(', '))}.</span>}
        <span className="spacer" />
        <a href={calendarLink(e)} target="_blank" rel="noopener">
          Add to calendar
        </a>
        <span className="muted">{e.source}</span>
      </div>
    </section>
  );
}

function Tips() {
  return (
    <details className="card event-tips">
      <summary>Getting a job out of an event</summary>
      <ul className="small">
        <li>Before you go, pick two or three people from the speaker or sponsor list and read what they work on, so you have something real to ask.</li>
        <li>Have a 20-second intro ready: who you are, what you built, what you're looking for (for example, Summer 2027 SWE internship).</li>
        <li>Virtual events count when you're visible: keep your camera on in breakouts, ask a question in the chat with your name, and message the speaker on LinkedIn the same day mentioning their talk.</li>
        <li>Virtual career fairs and recruiter sessions in Canada are worth the most online; general webinars are mostly for learning.</li>
        <li>At hackathons, ship something small that works, and put it on your resume and GitHub that week.</li>
        <li>Follow up within 48 hours. If someone mentions an opening, add it on the Leads page while it's fresh.</li>
      </ul>
    </details>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(`events.${key}`);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(`events.${key}`, value);
  } catch {
    // Private window: the choice just isn't remembered.
  }
}

function rememberedFilter(): Partial<EventFilter> {
  try {
    return JSON.parse(remembered('filter') ?? '{}') as Partial<EventFilter>;
  } catch {
    return {};
  }
}
