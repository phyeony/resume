import { useEffect, useMemo, useState } from 'react';
import openingsUrl from '../../applications/openings.json?url';
import type { CompanyInfo } from '../../model/types';
import { companyKey, fame } from '../../applications/fame';
import {
  REGION_LABELS,
  SEASON_LABELS,
  SORT_LABELS,
  SOON_DAYS,
  STATUS_LABELS,
  buildHistory,
  defaultTerm,
  inPlaces,
  isPlaceFilterEmpty,
  monthCounts,
  openingKey,
  predict,
  sortPredictions,
  termCode,
  termLabel,
  termStart,
  upcomingTerms,
  type OpeningSort,
  type OpeningsData,
  type PlaceFilter,
  type Prediction,
  type Region,
} from '../../applications/openings';
import { useOwnerData } from './Admin';
import { listCompanies } from './store';
import './openings.css';

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 50;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Scope = 'mine' | 'all';

/** When internships tend to open, per company, from past years' postings: the window for a term to come. */
export function OpeningsPage() {
  const { leads, applications } = useOwnerData();
  const [data, setData] = useState<OpeningsData | null>(null);
  const [error, setError] = useState('');
  const terms = useMemo(() => upcomingTerms(Date.now(), 6), []);
  const [code, setCode] = useState(() => remembered('term') ?? termCode(defaultTerm()));
  const target = terms.find((t) => termCode(t) === code) ?? defaultTerm();
  const [scope, setScope] = useState<Scope>(() => (remembered('scope') as Scope | null) ?? 'mine');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OpeningSort>(() => (remembered('sort') as OpeningSort | null) ?? 'soonest');
  const [regions, setRegions] = useState<Region[]>(() => (remembered('regions') ?? '').split(',').filter((r): r is Region => r in REGION_LABELS));
  const [placeText, setPlaceText] = useState(() => remembered('places') ?? '');
  const [companies, setCompanies] = useState<Map<string, CompanyInfo>>(new Map());
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(openingsUrl)
      .then((r) => (r.ok ? (r.json() as Promise<OpeningsData>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
    // Stars and Wikipedia fame from the Leads page, for "Best known"; the page works without them.
    listCompanies()
      .then((cs) => setCompanies(new Map(cs.map((c) => [c.key, c]))))
      .catch((e: unknown) => console.error("Couldn't load companies", e));
  }, []);

  const history = useMemo(() => (data ? buildHistory(data, leads) : []), [data, leads]);
  const mine = useMemo(() => new Set([...leads, ...applications].map((x) => openingKey(x.company)).filter(Boolean)), [leads, applications]);
  const filter: PlaceFilter = useMemo(
    () => ({ regions, places: placeText.split(',').map((w) => w.trim()).filter(Boolean) }),
    [regions, placeText],
  );
  const predictions = useMemo(() => {
    const known = (p: Prediction): [number, number] => {
      const c = companies.get(companyKey(p.company.name));
      return [c?.starred ? 1 : 0, fame(c) ?? -1];
    };
    return sortPredictions(
      history.map((h) => predict(inPlaces(h, filter), target)),
      sort,
      known,
    );
  }, [history, target, filter, sort, companies]);
  const hidden = (p: Prediction) => !!companies.get(companyKey(p.company.name))?.hidden;

  const q = openingKey(search);
  const rows = q
    ? // The name itself first, then names starting with it, then the rest: "SAP" before "Johns Hopkins APL".
      predictions
        .filter((p) => p.company.key.includes(q) && (isPlaceFilterEmpty(filter) || p.company.postings.length > 0))
        .sort((a, b) => matchRank(a.company.key, q) - matchRank(b.company.key, q))
    : predictions.filter((p) => (scope === 'all' || mine.has(p.company.key)) && !hidden(p) && (p.cycles.length > 0 || p.seen.length > 0));
  const due = rows.filter((p) => p.status === 'due').length;
  const soon = rows.filter((p) => p.status === 'soon').length;

  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(`openings.${key}`, value);
    } catch {
      // Private window: the choice just isn't remembered.
    }
  };

  return (
    <div className="pad openings">
      <div className="page-head">
        <h1>Openings</h1>
      </div>
      <p className="muted small">
        When internships tend to open, from when each company posted the same term in past years.
        {data && ` History up to ${fmtDay(Date.parse(data.generatedAt))}; your leads add anything newer.`}
      </p>

      <div className="openings-controls">
        <label>
          Term
          <select
            value={termCode(target)}
            onChange={(e) => {
              setCode(e.target.value);
              remember('term', e.target.value);
              setShown(PAGE);
            }}
          >
            {terms.map((t) => (
              <option key={termCode(t)} value={termCode(t)}>
                {termLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="grow-field">
          Company
          <input value={search} placeholder="Search every company, e.g. SAP" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as OpeningSort);
              remember('sort', e.target.value);
            }}
          >
            {(Object.keys(SORT_LABELS) as OpeningSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="openings-controls">
        <div className="chips" role="group" aria-label="Where">
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <button
              key={r}
              className={`chip ${regions.includes(r) ? 'on' : ''}`}
              onClick={() => {
                const next = regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r];
                setRegions(next);
                remember('regions', next.join(','));
                setShown(PAGE);
              }}
            >
              {REGION_LABELS[r]}
            </button>
          ))}
        </div>
        <label className="grow-field">
          <input
            value={placeText}
            placeholder="Cities, comma-separated, e.g. Vancouver, Toronto"
            onChange={(e) => {
              setPlaceText(e.target.value);
              remember('places', e.target.value);
              setShown(PAGE);
            }}
          />
        </label>
        <div className="chips">
          {(['mine', 'all'] as Scope[]).map((s) => (
            <button
              key={s}
              className={`chip ${scope === s && !q ? 'on' : ''}`}
              disabled={!!q}
              onClick={() => {
                setScope(s);
                remember('scope', s);
                setShown(PAGE);
              }}
            >
              {s === 'mine' ? 'In my leads & applications' : 'All companies'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">Couldn't load the posting history: {error}</p>}
      {!data && !error && <p className="muted">Loading posting history…</p>}
      {data && (
        <>
          <p className="small">
            {rows.length} compan{rows.length === 1 ? 'y' : 'ies'}
            {!isPlaceFilterEmpty(filter) && ' (counting only postings in the chosen places)'}
            {due > 0 && (
              <>
                {' · '}
                <span className="warn-text">{due} expected by now</span>
              </>
            )}
            {soon > 0 && (
              <>
                {' · '}
                <span className="ok-text">
                  {soon} opening in the next {SOON_DAYS} days
                </span>
              </>
            )}
          </p>
          {rows.length === 0 && (
            <p className="muted">
              {q
                ? `No company matching "${search}" in the history.`
                : `None of ${scope === 'mine' ? 'your companies' : 'the companies'} posted a ${SEASON_LABELS[target.season]} internship${isPlaceFilterEmpty(filter) ? '' : ' there'} in past years.${scope === 'mine' ? ' Try All companies.' : ''}`}
            </p>
          )}
          <div className="opening-list">
            {rows.slice(0, shown).map((p) => (
              <OpeningRow
                key={p.company.key}
                p={p}
                expanded={open === p.company.key}
                onToggle={() => setOpen(open === p.company.key ? null : p.company.key)}
              />
            ))}
          </div>
          {rows.length > shown && (
            <button className="link" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </button>
          )}
          <p className="muted small">
            Sources: {data.sources.join(', ')}. Dates are when a job first showed up on a list, so a company's own
            site may have had it a few days earlier. A posting that named no term isn't counted toward a term's window, and
            one with no location is left out while a place is chosen.
          </p>
        </>
      )}
    </div>
  );
}

function OpeningRow({ p, expanded, onToggle }: { p: Prediction; expanded: boolean; onToggle: () => void }) {
  const season = SEASON_LABELS[p.target.season];
  return (
    <section className="card opening">
      <div className="opening-head" onClick={onToggle}>
        <div className="grow">
          <strong>{p.company.name}</strong>
          <span className={`badge status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
          {p.confidence && <span className="muted small"> · {p.confidence} confidence</span>}
          <div className="small">{summary(p)}</div>
        </div>
        <button className="icon" aria-label={expanded ? 'Hide details' : 'Show details'}>
          {expanded ? '▴' : '▾'}
        </button>
      </div>
      {(p.cycles.length > 0 || p.seen.length > 0) && <Timeline p={p} />}
      {expanded && (
        <div className="opening-details small">
          {p.cycles.length === 0 && <p className="muted">No {season} postings from past years in the history.</p>}
          <ul>
            {p.cycles.map((c) => (
              <li key={termCode(c.term)}>
                <strong>{termLabel(c.term)}</strong>: {c.count} posting{c.count === 1 ? '' : 's'}, first {fmtDay(termStart(c.term) + c.first * DAY)}
                {c.count > 1 && `, most ${fmtMonth(termStart(c.term) + c.p25 * DAY)} – ${fmtMonth(termStart(c.term) + c.p75 * DAY)}`}
              </li>
            ))}
            {p.seen.length > 0 && (
              <li>
                <strong>{termLabel(p.target)}</strong>: {p.seen.length} so far, first {fmtDay(p.seen[0].at)}
              </li>
            )}
          </ul>
          <p className="muted">Busiest months across every term: {busiestMonths(p) || '—'}</p>
          {p.company.titles.length > 0 && (
            <p className="muted">
              Recent titles: {p.company.titles.join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const matchRank = (key: string, q: string) => (key === q ? 0 : key.startsWith(q) ? 1 : 2);

function summary(p: Prediction): string {
  const window =
    p.windowStart !== undefined && p.windowEnd !== undefined ? `most between ${fmtMonth(p.windowStart)} and ${fmtMonth(p.windowEnd)}` : '';
  if (p.status === 'open') {
    const first = `${p.seen.length} ${termLabel(p.target)} posting${p.seen.length === 1 ? '' : 's'} since ${fmtDay(p.seen[0].at)}`;
    return window ? `${first}; past years: ${window}.` : `${first}.`;
  }
  if (p.expectedFirst === undefined) return `No ${SEASON_LABELS[p.target.season]} postings in past years.`;
  const first = `First posting usually around ${fmtDay(p.expectedFirst)}`;
  return `${first}, ${window}.`;
}

function busiestMonths(p: Prediction): string {
  const counts = monthCounts(p.company);
  const max = Math.max(...counts);
  if (!max) return '';
  return counts
    .map((n, m) => ({ n, m }))
    .filter((x) => x.n >= max * 0.6)
    .map((x) => MONTH_NAMES[x.m])
    .join(', ');
}

const W = 640;
const LEFT = 44;
const ROW = 14;

/**
 * Fifteen months before the term to two months in: each past term's postings, moved to the target year,
 * one row per term, under the predicted window; this year's postings and today on top.
 */
function Timeline({ p }: { p: Prediction }) {
  const start = termStart(p.target);
  const from = new Date(start);
  from.setMonth(from.getMonth() - 15);
  const to = new Date(start);
  to.setMonth(to.getMonth() + 2);
  const x = (t: number) => LEFT + ((t - from.getTime()) / (to.getTime() - from.getTime())) * (W - LEFT - 6);
  const inRange = (t: number) => t >= from.getTime() && t <= to.getTime();
  const rows: { label: string; dots: number[]; current?: boolean }[] = [
    ...p.cycles.map((c) => ({ label: termCode(c.term), dots: c.offsets.map((o) => start + o * DAY) })),
    { label: termCode(p.target), dots: p.seen.map((s) => s.at), current: true },
  ];
  const height = 18 + rows.length * ROW + 4;
  const ticks: Date[] = [];
  for (const d = new Date(from); d <= to; d.setMonth(d.getMonth() + 1)) ticks.push(new Date(d));
  const now = Date.now();

  return (
    <svg className="opening-timeline" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${p.company.name} postings by month`}>
      {p.windowStart !== undefined && p.windowEnd !== undefined && (
        <rect
          className="window"
          x={x(Math.max(p.windowStart, from.getTime()))}
          y={14}
          width={Math.max(3, x(Math.min(p.windowEnd, to.getTime())) - x(Math.max(p.windowStart, from.getTime())))}
          height={rows.length * ROW + 2}
          rx={3}
        >
          <title>
            Expected window: {fmtDay(p.windowStart)} – {fmtDay(p.windowEnd)}
          </title>
        </rect>
      )}
      {ticks.map((d) => (
        <g key={d.getTime()}>
          <line className="tick" x1={x(d.getTime())} x2={x(d.getTime())} y1={12} y2={height - 2} />
          {((d.getMonth() % 3 === 0 && Math.abs(d.getTime() - start) > 45 * DAY && x(d.getTime()) < W - 40) || d.getTime() === start) && (
            <text className={`tick-label ${d.getTime() === start ? 'start' : ''}`} x={x(d.getTime()) + 2} y={10}>
              {d.getTime() === start ? 'Term starts' : `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`}
            </text>
          )}
        </g>
      ))}
      {rows.map((r, i) => {
        const y = 22 + i * ROW;
        return (
          <g key={r.label}>
            <text className={`row-label ${r.current ? 'current' : ''}`} x={0} y={y + 3.5}>
              {r.label}
            </text>
            {r.dots.filter(inRange).map((t, j) => (
              <circle key={j} className={r.current ? 'dot current' : 'dot'} cx={x(t)} cy={y} r={3.2}>
                <title>{r.current ? fmtDay(t) : `${fmtDay(t)} (moved to this year)`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {inRange(now) && <line className="today" x1={x(now)} x2={x(now)} y1={12} y2={height - 2} />}
    </svg>
  );
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(`openings.${key}`);
  } catch {
    return null;
  }
}
