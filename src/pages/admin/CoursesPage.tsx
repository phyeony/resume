import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ALTERNATES,
  COURSES,
  IN_PROGRESS,
  RECOMMENDATION_NOTES,
  RECOMMENDED,
  SPRING_2027,
  STATUS_LABELS,
  TAKEN,
  TERMS,
  UNITS_LEFT,
  clashes,
  compareCodes,
  courseLink,
  coursysOfferingUrl,
  coursysUrl,
  recommendByRatings,
  topRatedByTerm,
  usualTerms,
  eligibility,
  expected,
  normalizePlan,
  planProblems,
  planUnits,
  type Course,
  type Plan,
  type PlanItem,
  type Section,
  type TermKey,
  PAST_SECTIONS,
  TOP_FIVE,
  offeredIn,
  teachersOf,
  usualSeason,
  type Teacher,
} from '../../courses/catalog';
import { clip, lookup, ratingLine, ratingTone, rmpProfileUrl, rmpSearchUrl, type RmpSummary } from '../../courses/rmp';
import { canFetchPages, fetchPage } from '../../applications/pageFetch';
import { loadCoursePlan, saveCoursePlan } from './store';
import './courses.css';

const TABS = [
  { key: 'plan', label: 'My plan' },
  { key: 'terms', label: 'By term' },
  { key: 'spring', label: 'Spring 2027' },
  { key: 'later', label: 'Summer & Fall' },
  { key: 'history', label: 'History' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const EMPTY_PLAN: Plan = { spring: [], summer: [], fall: [] };
const termLabel = (k: TermKey) => TERMS.find((t) => t.key === k)!.label;
const springOffering = (code: string) => SPRING_2027.find((o) => o.code === code);

/** Courses to plan the last 27 units: Spring 2027 offerings, expected Summer and Fall courses, instructors' ratings. */
export function CoursesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : 'plan';
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const ratings = useRatings();

  useEffect(() => {
    loadCoursePlan()
      .then((p) => setPlan(p ? normalizePlan(p.plan) : RECOMMENDED))
      .catch((e: unknown) => {
        setError(`Couldn't load your plan: ${String(e)}`);
        setPlan(RECOMMENDED);
      });
  }, []);

  function update(next: Plan) {
    setPlan(next);
    setError('');
    saveCoursePlan({ plan: next, updatedAt: Date.now() }).catch((e: unknown) => setError(`Couldn't save that change: ${String(e)}`));
  }

  const add = (term: TermKey, code: string) => {
    if (!plan || plan[term].some((i) => i.code === code)) return;
    // In Spring, the first section that fits around what's already planned.
    const sections = term === 'spring' ? springOffering(code)?.sections ?? [] : [];
    const section = (sections.find((s) => clashes([...plan.spring, { code, section: s.section }]).length === 0) ?? sections[0])?.section;
    update({ ...plan, [term]: [...plan[term], section ? { code, section } : { code }] });
  };
  const remove = (term: TermKey, code: string) => plan && update({ ...plan, [term]: plan[term].filter((i) => i.code !== code) });
  const setSection = (code: string, section: string) =>
    plan && update({ ...plan, spring: plan.spring.map((i) => (i.code === code ? { ...i, section } : i)) });
  const planned = (term: TermKey, code: string) => !!plan?.[term].some((i) => i.code === code);

  const units = plan ? planUnits(plan) : 0;

  return (
    <div className="pad courses">
      <div className="courses-head">
        <h1>Course plan</h1>
        <p className="muted">
          Your last {UNITS_LEFT} units, for software internships. Spring 2027 is from SFU's published outlines; Summer and Fall 2027 aren't out yet, so
          those are courses that ran in the same terms of 2025 and 2026.
        </p>
      </div>

      <div className="card courses-summary">
        <div className="courses-progress">
          <span className="courses-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (units / UNITS_LEFT) * 100)}%` }} className={units > UNITS_LEFT ? 'over' : ''} />
          </span>
          <span className={`small tabular ${units === UNITS_LEFT ? 'ok-text' : 'muted'}`}>
            {units} of {UNITS_LEFT} units planned
          </span>
        </div>
        <p className="small muted courses-legend">
          <Value v={3} /> high value for software jobs · <Value v={2} /> some · <Value v={1} /> niche or research-leaning
        </p>
        {plan && <PlanWarnings plan={plan} />}
        {error && <p className="error small">{error}</p>}
      </div>

      <div className="courses-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      {!plan ? (
        <p className="muted">Loading your plan…</p>
      ) : (
        <>
          {tab === 'plan' && (
            <PlanTab plan={plan} ratings={ratings} onRemove={remove} onAdd={add} onSection={setSection} onReset={() => update(RECOMMENDED)} onUse={update} />
          )}
          {tab === 'terms' && <TermsTab ratings={ratings} planned={planned} onAdd={add} />}
          {tab === 'spring' && <SpringTab ratings={ratings} planned={(c) => planned('spring', c)} onAdd={(c) => add('spring', c)} />}
          {tab === 'later' && <LaterTab ratings={ratings} planned={planned} onAdd={add} />}
          {tab === 'history' && <HistoryTab />}
        </>
      )}
    </div>
  );
}

function PlanWarnings({ plan }: { plan: Plan }) {
  const problems = planProblems(plan);
  const clash = clashes(plan.spring);
  const units = planUnits(plan);
  const lines = [
    ...problems,
    ...clash.map(([a, b]) => `${a} and ${b} meet at the same time in Spring; pick other sections.`),
    ...(units > UNITS_LEFT ? [`That's ${units - UNITS_LEFT} units more than you need.`] : []),
  ];
  if (!lines.length) return null;
  return (
    <ul className="courses-warnings">
      {lines.map((l) => (
        <li key={l} className="warn-text small">
          {l}
        </li>
      ))}
    </ul>
  );
}

// ---- plan --------------------------------------------------------------------

function PlanTab(props: {
  plan: Plan;
  ratings: Ratings;
  onRemove(term: TermKey, code: string): void;
  onAdd(term: TermKey, code: string): void;
  onSection(code: string, section: string): void;
  onReset(): void;
  onUse(plan: Plan): void;
}) {
  const { plan, ratings, onRemove, onAdd, onSection, onReset, onUse } = props;
  const isRecommended = JSON.stringify(plan) === JSON.stringify(RECOMMENDED);
  return (
    <>
      <div className="courses-terms">
        {TERMS.map((t) => {
          const items = plan[t.key];
          const options = (t.key === 'spring' ? SPRING_2027.map((o) => o.code) : expected(t.key).map((e) => e.code)).filter(
            (c) => !items.some((i) => i.code === c) && !['taken', 'in-progress'].includes(eligibility(COURSES[c]).status),
          );
          return (
            <section key={t.key} className="card courses-term">
              <div className="courses-term-head">
                <h2>{t.label}</h2>
                <span className="small muted tabular">{planUnits({ ...EMPTY_PLAN, [t.key]: items })} units</span>
                {!t.published && <span className="badge tiny muted-badge">expected</span>}
              </div>
              {items.length === 0 && <p className="muted small">Nothing planned.</p>}
              <ul className="courses-planned">
                {items.map((i) => (
                  <PlannedRow key={i.code} term={t.key} item={i} ratings={ratings} onRemove={() => onRemove(t.key, i.code)} onSection={(s) => onSection(i.code, s)} />
                ))}
              </ul>
              {options.length > 0 && (
                <select
                  className="courses-add"
                  value=""
                  aria-label={`Add a course to ${t.label}`}
                  onChange={(e) => e.target.value && onAdd(t.key, e.target.value)}
                >
                  <option value="">+ Add a course…</option>
                  {options.map((c) => (
                    <option key={c} value={c}>
                      {c} {COURSES[c].title}
                    </option>
                  ))}
                </select>
              )}
            </section>
          );
        })}
      </div>

      <RatingsPlan plan={plan} ratings={ratings} onUse={onUse} onAdd={onAdd} />

      <h2 className="courses-h2">Good swaps</h2>
      <p className="muted small">If a recommended course is full, clashes, or doesn't run.</p>
      <div className="courses-alts">
        {ALTERNATES.map((a) => {
          const inPlan = plan[a.term].some((i) => i.code === a.code);
          return (
            <div key={a.code + a.term} className="card courses-alt">
              <div>
                <CourseCode code={a.code} /> {COURSES[a.code].title} <span className="small muted">· {termLabel(a.term)}</span>
              </div>
              <p className="small">{a.note}</p>
              <SwapPeople code={a.code} term={a.term} ratings={ratings} />
              <UsualTag code={a.code} />
              <button className="small-btn" disabled={inPlan} onClick={() => onAdd(a.term, a.code)}>
                {inPlan ? 'In your plan' : `Add to ${termLabel(a.term)}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="btn-row courses-reset">
        <button disabled={isRecommended} onClick={onReset}>
          Reset to the recommended plan
        </button>
        <span className="small muted">Check your plan against your degree audit (goSFU → Academic Progress) before enrolling.</span>
      </div>
    </>
  );
}

function PlannedRow(props: { term: TermKey; item: PlanItem; ratings: Ratings; onRemove(): void; onSection(s: string): void }) {
  const { term, item, ratings, onRemove, onSection } = props;
  const c = COURSES[item.code];
  const e = eligibility(c);
  const offering = term === 'spring' ? springOffering(item.code) : undefined;
  const section = offering?.sections.find((s) => s.section === item.section) ?? offering?.sections[0];
  return (
    <li className="courses-planned-row">
      <div className="courses-planned-top">
        <span className="grow-text">
          <CourseCode code={c.code} /> {c.title} <UsualTag code={c.code} />
        </span>
        <Value v={c.value} />
        <button className="icon" title={`Remove ${c.code}`} aria-label={`Remove ${c.code}`} onClick={onRemove}>
          ✕
        </button>
      </div>
      <p className="small courses-why">{RECOMMENDATION_NOTES[c.code] ?? c.why}</p>
      {e.status !== 'eligible' && <StatusLine course={c} />}
      <BetterProf code={c.code} term={term} section={term === 'spring' ? (section?.instructor ?? null) : null} ratings={ratings} />
      <PastTeachers code={c.code} ratings={ratings} />
      {offering && offering.sections.length > 1 && (
        <select className="courses-section-pick" value={section?.section} onChange={(ev) => onSection(ev.target.value)} aria-label={`${c.code} section`}>
          {offering.sections.map((s) => (
            <option key={s.section} value={s.section}>
              {s.section} · {s.times ?? 'times TBA'}
              {s.campus ? ` · ${s.campus}` : ''}
            </option>
          ))}
        </select>
      )}
      {section && (
        <div className="small muted">
          {offering!.sections.length === 1 && (
            <>
              {section.section} · {section.times ?? 'times TBA'}
              {section.campus ? ` · ${section.campus}` : ''}
              {' · '}
            </>
          )}
          {section.instructor ? <Prof name={section.instructor} ratings={ratings} compact /> : 'Instructor TBA'}
        </div>
      )}
    </li>
  );
}

// ---- by term -----------------------------------------------------------------

/** Each term: the five best courses you can take, then every 300- and 400-level course it offers. */
function TermsTab({ ratings, planned, onAdd }: { ratings: Ratings; planned(term: TermKey, code: string): boolean; onAdd(term: TermKey, code: string): void }) {
  const [term, setTerm] = useState<TermKey>(() => (['spring', 'summer', 'fall'].includes(remembered('term') ?? '') ? (remembered('term') as TermKey) : 'spring'));
  const [hideTaken, setHideTaken] = useState(() => remembered('termsHideTaken') === 'yes');
  const t = TERMS.find((x) => x.key === term)!;
  const likelihood = (code: string) => (term === 'spring' ? null : expected(term).find((e) => e.code === code)?.likelihood ?? null);
  const all = offeredIn(term)
    .map((code) => ({ code, c: COURSES[code], e: eligibility(COURSES[code]) }))
    .filter(({ e }) => !hideTaken || !['taken', 'in-progress'].includes(e.status))
    .sort((a, b) => compareCodes(a.code, b.code));
  return (
    <>
      <div className="courses-term-pick" role="tablist">
        {TERMS.map((x) => (
          <button
            key={x.key}
            className={x.key === term ? 'active' : ''}
            aria-selected={x.key === term}
            onClick={() => {
              setTerm(x.key);
              remember('term', x.key);
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="small muted">
        {t.published
          ? "From SFU's published Spring 2027 outlines."
          : `Not published yet: courses that ran in ${t.key === 'summer' ? 'Summer' : 'Fall'} 2025 or 2026. "Likely" ran both years, "possible" one.`}
      </p>

      <h2 className="courses-h2">Top 5 you can take</h2>
      <ol className="courses-top">
        {TOP_FIVE[term].map((code, i) => {
          const c = COURSES[code];
          const sections = term === 'spring' ? springOffering(code)?.sections ?? [] : [];
          const people = term === 'spring' ? sections.map((s) => s.instructor).filter((n): n is string => !!n) : seasonTeachers(code, term);
          return (
            <li key={code} className="card courses-top-item">
              <span className="courses-num">{i + 1}</span>
              <div className="courses-top-body">
                <div>
                  <CourseCode code={code} /> {c.title} <Value v={c.value} /> <UsualTag code={code} />
                  {likelihood(code) && <span className={`badge tiny ${likelihood(code) === 'likely' ? '' : 'muted-badge'}`}>{likelihood(code)}</span>}
                </div>
                <div className="small">{RECOMMENDATION_NOTES[code] ?? c.why}</div>
                <div className="small muted">
                  {term === 'spring' ? (sections.map((s) => `${s.section} ${s.times ?? 'TBA'}`).join(' · ') || 'Times TBA') : 'Instructor not announced'}
                  {people.length > 0 && (
                    <>
                      {term === 'spring' ? ' · ' : ' · before: '}
                      {[...new Set(people)].map((n, j) => (
                        <span key={n}>
                          {j > 0 && ', '}
                          <Prof name={n} ratings={ratings} compact />
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <button className="small-btn" disabled={planned(term, code)} onClick={() => onAdd(term, code)}>
                {planned(term, code) ? 'In plan' : 'Add'}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="courses-term-head courses-all-head">
        <h2 className="courses-h2">All 300+ CMPT, MACM, MATH and IAT courses in {t.label}</h2>
        <label className="check small">
          <input
            type="checkbox"
            checked={hideTaken}
            onChange={(e) => {
              setHideTaken(e.target.checked);
              remember('termsHideTaken', e.target.checked ? 'yes' : 'no');
            }}
          />
          Hide taken
        </label>
      </div>
      <p className="small muted">{all.length} courses. Co-op, directed studies and research projects are left out.</p>
      <ul className="courses-all">
        {all.map(({ code, c, e }) => {
          const blocked = e.status === 'taken' || e.status === 'in-progress';
          const people =
            term === 'spring' ? (springOffering(code)?.sections ?? []).map((s) => s.instructor).filter((n): n is string => !!n) : seasonTeachers(code, term);
          return (
            <li key={code} className={blocked ? 'dim' : ''}>
              <div className="courses-all-top">
                <span className="courses-all-name">
                  <CourseCode code={code} /> {c.title}
                </span>
                <Value v={c.value} />
              </div>
              <div className="courses-all-meta small">
                <span className={`badge status-${e.status}`}>{STATUS_LABELS[e.status]}</span>
                {likelihood(code) && <span className={`badge ${likelihood(code) === 'likely' ? '' : 'muted-badge'}`}>{likelihood(code)}</span>}
                <UsualTag code={code} />
                {[...new Set(people)].map((n) => (
                  <Prof key={n} name={n} ratings={ratings} compact />
                ))}
                {e.missing.length > 0 && <span className="danger-text">Needs {e.missing.join(' and ')}</span>}
                {!blocked && (
                  <button className="link small" disabled={planned(term, code)} onClick={() => onAdd(term, code)}>
                    {planned(term, code) ? 'In plan' : '+ Add'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Who taught a course in this season before (Summer or Fall), newest first. */
function seasonTeachers(code: string, term: TermKey): string[] {
  const season = term === 'summer' ? 'Summer' : term === 'fall' ? 'Fall' : 'Spring';
  return teachersOf(code)
    .filter((t) => t.terms.some((x) => x.startsWith(season)))
    .sort((a, b) => b.terms.filter((x) => x.startsWith(season)).length - a.terms.filter((x) => x.startsWith(season)).length)
    .map((t) => t.name);
}

// ---- Spring 2027 -------------------------------------------------------------

type SpringSort = 'number' | 'value';

function SpringTab({ ratings, planned, onAdd }: { ratings: Ratings; planned(code: string): boolean; onAdd(code: string): void }) {
  const [hideTaken, setHideTaken] = useState(() => remembered('hideTaken') !== 'no');
  const [onlyEligible, setOnlyEligible] = useState(() => remembered('onlyEligible') === 'yes');
  const [sort, setSort] = useState<SpringSort>(() => (remembered('sort') === 'value' ? 'value' : 'number'));
  const rows = useMemo(() => {
    const list = SPRING_2027.map((o) => ({ o, c: COURSES[o.code], e: eligibility(COURSES[o.code]) })).filter(
      ({ e }) => (!hideTaken || !['taken', 'in-progress'].includes(e.status)) && (!onlyEligible || e.status === 'eligible' || e.status === 'check'),
    );
    if (sort === 'value') list.sort((a, b) => b.c.value - a.c.value);
    return list;
  }, [hideTaken, onlyEligible, sort]);
  const hidden = SPRING_2027.length - rows.length;

  return (
    <>
      <div className="courses-controls">
        <label className="check">
          <input
            type="checkbox"
            checked={hideTaken}
            onChange={(e) => {
              setHideTaken(e.target.checked);
              remember('hideTaken', e.target.checked ? 'yes' : 'no');
            }}
          />
          Hide courses I've taken
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyEligible}
            onChange={(e) => {
              setOnlyEligible(e.target.checked);
              remember('onlyEligible', e.target.checked ? 'yes' : 'no');
            }}
          />
          Only ones I can take
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SpringSort);
              remember('sort', e.target.value);
            }}
          >
            <option value="number">Course number</option>
            <option value="value">Job market value</option>
          </select>
        </label>
      </div>
      <p className="small muted">
        {rows.length} upper-division courses (CMPT, plus MACM, MATH and IAT ones useful for software){hidden ? `, ${hidden} hidden` : ''}. Co-op, directed studies and research projects are left out. Live enrolment is on{' '}
        <a href={coursysUrl('1271')} target="_blank" rel="noopener">
          CourSys ↗
        </a>
        .
      </p>
      {!canFetchPages() && <RatingsHint />}
      <div className="courses-list">
        {rows.map(({ o, c }) => (
          <CourseCard key={o.code} course={c} sections={o.sections} ratings={ratings} inPlan={planned(o.code)} onAdd={() => onAdd(o.code)} />
        ))}
      </div>
    </>
  );
}

function CourseCard(props: { course: Course; sections?: Section[]; ratings?: Ratings; badge?: ReactNode; inPlan: boolean; addLabel?: string; onAdd(): void }) {
  const { course: c, sections, ratings, badge, inPlan, addLabel = 'Add to plan', onAdd } = props;
  const e = eligibility(c);
  const blocked = e.status === 'taken' || e.status === 'in-progress';
  return (
    <article className={`card courses-course ${blocked ? 'dim' : ''}`}>
      <div className="courses-course-head">
        <h3>
          <CourseCode code={c.code} /> <span className="courses-title">{c.title}</span>
        </h3>
        <span className={`badge status-${e.status}`}>{STATUS_LABELS[e.status]}</span>
        {badge}
        <UsualTag code={c.code} />
        <Value v={c.value} />
      </div>
      <p className="courses-about">{c.about}</p>
      <p className="small">
        <span className="courses-label">For jobs</span> {c.why}
      </p>
      <StatusLine course={c} showPrereq />
      {ratings && <PastTeachers code={c.code} ratings={ratings} />}
      {sections && (
        <ul className="courses-sections">
          {sections.map((s) => (
            <li key={s.section}>
              <div className="courses-section-top">
                <a href={coursysOfferingUrl(c.code, 'Spring 2027', s.section)} target="_blank" rel="noopener" className="courses-sec" title="CourSys">
                  {s.section}
                </a>
                <span className="small">
                  {s.times ?? 'Times TBA'}
                  {s.campus ? ` · ${s.campus}` : ''}
                </span>
              </div>
              {s.topic && <div className="small muted">Topic: {s.topic}</div>}
              <div className="small">{s.instructor ? <Prof name={s.instructor} ratings={ratings!} /> : <span className="muted">Instructor TBA</span>}</div>
            </li>
          ))}
        </ul>
      )}
      {!blocked && (
        <div className="btn-row">
          <button className="small-btn" disabled={inPlan} onClick={onAdd}>
            {inPlan ? 'In your plan' : addLabel}
          </button>
        </div>
      )}
    </article>
  );
}

function StatusLine({ course, showPrereq }: { course: Course; showPrereq?: boolean }) {
  const e = eligibility(course);
  const prereq = course.prereq.map((g) => g.filter((c) => !c.endsWith('?')).join(' or ')).map((g) => (g.includes(' or ') ? `(${g})` : g));
  return (
    <div className="small courses-status">
      {showPrereq && (prereq.length > 0 || course.needs) && (
        <div>
          <span className="courses-label">Needs</span> {prereq.join(' and ') || '—'}
          {course.needs && e.status !== 'check' ? `. ${course.needs}` : ''}
        </div>
      )}
      {e.missing.length > 0 && <div className="danger-text">You're missing {e.missing.join(' and ')}.</div>}
      {e.notes.map((n) => (
        <div key={n} className="warn-text">
          {n}
        </div>
      ))}
    </div>
  );
}

function Value({ v }: { v: 1 | 2 | 3 }) {
  const label = v === 3 ? 'High job market value' : v === 2 ? 'Some job market value' : 'Niche or research-leaning';
  return (
    <span className={`courses-value v${v}`} title={label} aria-label={label}>
      {'●'.repeat(v)}
      <span className="faint">{'●'.repeat(3 - v)}</span>
    </span>
  );
}

/** The course code, linked to its newest CourSys page. */
function CourseCode({ code }: { code: string }) {
  const { url, term } = courseLink(code);
  return (
    <a href={url} target="_blank" rel="noopener" className="courses-code" title={`${term} on CourSys`}>
      {code}
    </a>
  );
}

// ---- plan by ratings ---------------------------------------------------------

/** The second recommendation: the same 27 units, chasing well-rated instructors. */
function RatingsPlan({ plan, ratings, onUse, onAdd }: { plan: Plan; ratings: Ratings; onUse(p: Plan): void; onAdd(term: TermKey, code: string): void }) {
  const rated = Object.values(ratings).filter((r) => r.state === 'found' && r.summary.numRatings > 0).length;
  const loading = Object.values(ratings).some((r) => r.state === 'loading');
  const score = (n: string) => ratingOf(ratings, n);
  const top = useMemo(() => topRatedByTerm(score), [ratings]);
  const { plan: byRatings } = useMemo(() => recommendByRatings(score), [ratings]);
  const inUse = JSON.stringify(plan) === JSON.stringify(byRatings);
  return (
    <section className="card courses-rated">
      <div className="courses-term-head">
        <h2>Best-rated instructors, 5 per term</h2>
        <span className="small muted">{loading ? 'Loading ratings…' : `${rated} instructors rated`}</span>
      </div>
      <p className="small muted">
        Courses you can take that are useful for software jobs, ranked by their instructor's rating. Summer and Fall use whoever taught it in that season before, so
        treat those instructors as likely, not confirmed. ✓ marks the 27-unit plan built from these.
      </p>
      {rated === 0 ? (
        <p className="small muted">{canFetchPages() ? 'Waiting for ratings.' : 'This needs ratings, which load through the Resume Studio Autofill extension.'}</p>
      ) : (
        <>
          <div className="courses-rated-terms">
            {TERMS.map((t) => (
              <div key={t.key}>
                <div className="courses-label">{t.label}</div>
                <ol>
                  {top[t.key].map((o) => {
                    const inPlan = plan[t.key].some((i) => i.code === o.code);
                    const picked = byRatings[t.key].some((i) => i.code === o.code);
                    return (
                      <li key={o.code} className="small">
                        <div>
                          {picked && <span className="ok-text" title="In the 27-unit plan from these">✓ </span>}
                          <CourseCode code={o.code} /> {COURSES[o.code].title}
                        </div>
                        <div className="muted courses-rated-meta">
                          {o.instructor ? (
                            <span>
                              {o.expectedInstructor ? 'Likely ' : ''}
                              <Prof name={o.instructor} ratings={ratings} compact />
                              {o.section ? ` · ${o.section}` : ''}
                            </span>
                          ) : (
                            <span>No rated instructor</span>
                          )}
                          <UsualTag code={o.code} />
                          <button className="link small" disabled={inPlan} onClick={() => onAdd(t.key, o.code)}>
                            {inPlan ? 'In plan' : '+ Add'}
                          </button>
                        </div>
                        <OtherProfs code={o.code} exclude={o.instructor ? [o.instructor] : []} ratings={ratings} />
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button className="small-btn" disabled={inUse} onClick={() => onUse(byRatings)}>
              {inUse ? 'Your plan is the ✓ courses' : 'Use the ✓ courses as my plan (27 units)'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Who teaches a swap in its term (Spring), or taught it in that season before, then everyone else who has taught it. */
function SwapPeople({ code, term, ratings }: { code: string; term: TermKey; ratings: Ratings }) {
  const people = term === 'spring' ? [...new Set((springOffering(code)?.sections ?? []).map((s) => s.instructor).filter((n): n is string => !!n))] : seasonTeachers(code, term);
  return (
    <div className="small">
      {people.length ? (
        <div>
          {term === 'spring' ? 'Spring 2027: ' : 'Likely: '}
          {people.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <Prof name={n} ratings={ratings} compact />
            </span>
          ))}
        </div>
      ) : (
        <div className="muted">Instructor TBA</div>
      )}
      <OtherProfs code={code} exclude={people} ratings={ratings} />
    </div>
  );
}

/** Everyone else who has taught a course since 2024, best-rated first, with when they taught it. */
function OtherProfs({ code, exclude, ratings }: { code: string; exclude: string[]; ratings: Ratings }) {
  const others = ranked(code, ratings).filter((t) => !exclude.includes(t.name));
  if (!others.length) return null;
  return (
    <div className="courses-also">
      <span className="muted">Also taught by </span>
      {others.map((t, i) => (
        <span key={t.name}>
          {i > 0 && ', '}
          <Prof name={t.name} ratings={ratings} compact />
          <span className="muted"> ({t.terms.map((x) => x.replace(/ 20(\d\d)$/, " '$1")).join(', ')})</span>
        </span>
      ))}
    </div>
  );
}

/** When a course usually runs: "Every Fall", "Spring & Fall", "Irregular"… */
function UsualTag({ code }: { code: string }) {
  const u = usualTerms(code);
  return (
    <span className={`courses-usual tone-${u.tone}`} title={u.detail}>
      {u.label}
    </span>
  );
}

// ---- who else teaches it -----------------------------------------------------

const ratingOf = (ratings: Ratings, name: string) => {
  const r = ratings[name];
  return r?.state === 'found' && r.summary.numRatings ? r.summary.avgRating : null;
};

/** Teachers best-rated first; unrated and not-yet-loaded ones after, in the order they taught it. */
function ranked(code: string, ratings: Ratings): Teacher[] {
  // 419's topic changes with the instructor, so its past instructors aren't collected.
  if (!(code in PAST_SECTIONS)) return [];
  return teachersOf(code)
    .map((t, i) => ({ t, i, r: ratingOf(ratings, t.name) }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1) || a.i - b.i)
    .map((x) => x.t);
}

const whenNext = (t: Teacher) => {
  const season = usualSeason(t);
  return season ? `usually teaches it in ${season}` : `last taught it ${t.terms[t.terms.length - 1]}`;
};

/** Everyone who taught the course 2024–2027, with their ratings, so you can pick a term for the instructor. */
function PastTeachers({ code, ratings }: { code: string; ratings: Ratings }) {
  const list = ranked(code, ratings);
  if (!list.length || (list.length === 1 && list[0].spring2027 && list[0].terms.length === 1)) return null;
  return (
    <details className="courses-past">
      <summary className="small">
        Who's taught it since 2024 <span className="muted">({list.length})</span>
      </summary>
      <ul>
        {list.map((t) => (
          <li key={t.name} className="small">
            <Prof name={t.name} ratings={ratings} compact />
            {t.spring2027 && <span className="badge tiny">Spring 2027</span>}
            <span className="muted">
              {' · '}
              {t.offerings.map((o, i) => (
                <span key={o.term}>
                  {i > 0 && ', '}
                  <a href={coursysOfferingUrl(code, o.term, o.section)} target="_blank" rel="noopener" className="courses-term-link" title="CourSys">
                    {o.term}
                  </a>
                </span>
              ))}
            </span>
            {t.topics.length > 0 && <div className="muted">Topics: {t.topics.join('; ')}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A planned course's better-rated instructor in another term, if there is one. */
function BetterProf({ code, term, section, ratings }: { code: string; term: TermKey; section: string | null; ratings: Ratings }) {
  const list = ranked(code, ratings);
  const best = list[0];
  const bestRating = best && ratingOf(ratings, best.name);
  // Only worth saying when there's a choice.
  if (!best || bestRating === null || best.name === section || list.filter((t) => ratingOf(ratings, t.name) !== null).length < 2) return null;
  // In Spring compare with the section's instructor; Summer and Fall instructors aren't known yet.
  const current = section ? ratingOf(ratings, section) : null;
  if (term === 'spring' && current !== null && bestRating <= current) return null;
  if (term === 'spring' && best.spring2027) return null;
  return (
    <div className="small courses-better">
      Best rated: <Prof name={best.name} ratings={ratings} compact /> {current !== null && <span className="muted">(vs {current.toFixed(1)})</span>}, {whenNext(best)}.
    </div>
  );
}

// ---- Summer and Fall ---------------------------------------------------------

function LaterTab({ ratings, planned, onAdd }: { ratings: Ratings; planned(term: TermKey, code: string): boolean; onAdd(term: TermKey, code: string): void }) {
  return (
    <>
      <p className="small muted">
        SFU publishes Summer outlines around February and Fall around June. "Likely" ran in both 2025 and 2026; "possible" in one of them. Instructors aren't
        known yet.
      </p>
      {(['summer', 'fall'] as const).map((term) => {
        const list = expected(term).filter((x) => !['taken', 'in-progress'].includes(eligibility(COURSES[x.code]).status));
        list.sort((a, b) => COURSES[b.code].value - COURSES[a.code].value || (a.likelihood === b.likelihood ? 0 : a.likelihood === 'likely' ? -1 : 1));
        return (
          <section key={term}>
            <h2 className="courses-h2">{termLabel(term)}</h2>
            <div className="courses-list">
              {list.map((x) => (
                <CourseCard
                  key={x.code}
                  course={COURSES[x.code]}
                  ratings={ratings}
                  badge={
                    <span className={`badge ${x.likelihood === 'likely' ? '' : 'muted-badge'}`} title={`Ran in ${x.years.join(' and ')}`}>
                      {x.likelihood}
                    </span>
                  }
                  inPlan={planned(term, x.code)}
                  addLabel={`Add to ${termLabel(term)}`}
                  onAdd={() => onAdd(term, x.code)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ---- history -----------------------------------------------------------------

function HistoryTab() {
  const groups = new Map<string, [string, string][]>();
  for (const [code, grade] of Object.entries(TAKEN)) {
    const subject = code.split(' ')[0];
    groups.set(subject, [...(groups.get(subject) ?? []), [code, grade]]);
  }
  return (
    <>
      <p className="small muted">From your advisor transcript, without its Fall 2026 enrolments: you aren't taking anything this term.</p>
      {IN_PROGRESS.length > 0 && (
        <div className="card">
          <h2 className="courses-h2 first">Taking now</h2>
          <div className="chips">
            {IN_PROGRESS.map((c) => (
              <span key={c} className="chip on">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {[...groups.entries()].map(([subject, list]) => (
        <div key={subject} className="card">
          <h2 className="courses-h2 first">{subject}</h2>
          <div className="chips">
            {list.map(([code, grade]) => (
              <span key={code} className="chip" title={COURSES[code]?.title}>
                {code} <span className="faint">{grade}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ---- RateMyProfessors --------------------------------------------------------

type Rating = { state: 'loading' } | { state: 'found'; summary: RmpSummary } | { state: 'none' } | { state: 'error'; error: string };
type Ratings = Record<string, Rating>;

const CACHE_KEY = 'courses.rmp';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const INSTRUCTORS = [
  ...new Set(
    [...SPRING_2027.flatMap((o) => o.sections), ...Object.values(PAST_SECTIONS).flat()].map((s) => s.instructor).filter((n): n is string => !!n),
  ),
];

function readCache(): Record<string, { summary: RmpSummary | null; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(name: string, summary: RmpSummary | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [name]: { summary, at: Date.now() } }));
  } catch {
    // Private window: ratings are fetched again next time.
  }
}

/** Every Spring instructor's RMP summary, cached for a week, fetched two at a time through the extension. */
function useRatings(): Ratings {
  const [ratings, setRatings] = useState<Ratings>(() => {
    const cache = readCache();
    const out: Ratings = {};
    for (const n of INSTRUCTORS) {
      const hit = cache[n];
      if (hit && Date.now() - hit.at < WEEK) out[n] = hit.summary ? { state: 'found', summary: hit.summary } : { state: 'none' };
    }
    return out;
  });

  useEffect(() => {
    if (!canFetchPages()) return;
    let stopped = false;
    const todo = INSTRUCTORS.filter((n) => !ratings[n]);
    if (!todo.length) return;
    setRatings((r) => ({ ...r, ...Object.fromEntries(todo.map((n) => [n, { state: 'loading' } as Rating])) }));
    const worker = async () => {
      for (let name = todo.shift(); name && !stopped; name = todo.shift()) {
        const n = name;
        try {
          const summary = await lookup(n, (url) => fetchPage(url));
          writeCache(n, summary);
          if (!stopped) setRatings((r) => ({ ...r, [n]: summary ? { state: 'found', summary } : { state: 'none' } }));
        } catch (e) {
          if (!stopped) setRatings((r) => ({ ...r, [n]: { state: 'error', error: e instanceof Error ? e.message : String(e) } }));
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => {
      stopped = true;
    };
    // Once per visit; the cache covers the rest.
  }, []);

  return ratings;
}

function Prof({ name, ratings, compact }: { name: string; ratings: Ratings; compact?: boolean }) {
  const [more, setMore] = useState(false);
  const r = ratings[name];
  const s = r?.state === 'found' ? r.summary : null;
  const href = s ? rmpProfileUrl(s.id) : rmpSearchUrl(name);
  const link = (
    <a href={href} target="_blank" rel="noopener" title={s ? 'RateMyProfessors profile' : 'Search RateMyProfessors'}>
      {name} ↗
    </a>
  );
  if (compact) {
    return (
      <span className="courses-prof-inline">
        {link}
        {s && <span className={`courses-score tone-${ratingTone(s)}`}>{s.numRatings ? `${s.avgRating.toFixed(1)}/5` : 'unrated'}</span>}
      </span>
    );
  }
  return (
    <div className="courses-prof">
      <div className="courses-prof-top">
        {link}
        {s && <span className={`courses-score tone-${ratingTone(s)}`}>{s.numRatings ? `${s.avgRating.toFixed(1)}` : '–'}</span>}
      </div>
      {r?.state === 'loading' && <div className="muted">Loading ratings…</div>}
      {r?.state === 'none' && <div className="muted">Not on RateMyProfessors under this name; the link searches for them.</div>}
      {r?.state === 'error' && <div className="muted">Couldn't load ratings ({r.error}).</div>}
      {s && (
        <>
          <div className="muted">{ratingLine(s)}</div>
          {s.tags.length > 0 && (
            <div className="courses-tags">
              {s.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          {s.reviews.slice(0, more ? 3 : 1).map((rv) => (
            <blockquote key={rv.comment} className="courses-review">
              {more ? rv.comment : clip(rv.comment)}
              <span className="muted">
                {' '}
                — {[rv.course, rv.date.slice(0, 7)].filter(Boolean).join(', ')}
              </span>
            </blockquote>
          ))}
          {s.reviews.length > 0 && (
            <button className="link small" onClick={() => setMore(!more)}>
              {more ? 'Less' : s.reviews.length > 1 ? `More reviews (${s.reviews.length})` : 'Full review'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RatingsHint() {
  return (
    <p className="notice small">
      Instructor names link to RateMyProfessors. To see rating summaries here, open this page in Chrome with the Resume Studio Autofill extension
      installed; it fetches RateMyProfessors for the page.
    </p>
  );
}

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(`courses.${key}`);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(`courses.${key}`, value);
  } catch {
    // Private window: the choice just isn't remembered.
  }
}
