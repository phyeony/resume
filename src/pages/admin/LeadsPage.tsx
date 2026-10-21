import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CompanyInfo, FeedSettings, Lead, LeadStatus } from '../../model/types';
import { TIER_LABELS } from '../../model/types';
import { CATEGORIES, DEFAULT_FEED_SETTINGS, FEEDS, fetchFeed, filterJobs, planImport, companyFacts } from '../../applications/feeds';
import { RateLimited, articleFromUrl, articleUrl, companyKey, domainHints, fameLabel, findArticles, lastMonth, monthlyViews } from '../../applications/fame';
import { SORT_LABELS, groupByCompany, matchPrefs, scoreLead, sortLeads, type LeadSort, type MatchPrefs } from '../../applications/leadSort';
import { appliedFromLead, urlKey } from '../../applications/model';
import { knownSources } from '../../applications/stats';
import { companyFromUrl } from '../../applications/summarize';
import { GmailAuthExpired, fetchLinkedInAlerts } from '../../applications/gmail';
import { withoutKnownLinkedIn } from '../../applications/linkedin';
import { forgetGmailToken, gmailToken } from './auth';
import { listCompanies, loadAnswers, loadFeedSettings, newId, saveApplication, saveCompanies, saveFeedSettings, saveLead, saveLeads } from './store';
import { useOwnerData } from './Admin';
import { fmtDate, fmtDateTime } from './format';
import './applications.css';

const STATUS_LABELS: Record<LeadStatus, string> = { new: 'New', tracked: 'Tracked', dismissed: 'Dismissed' };

interface Companies {
  get(company: string): CompanyInfo | undefined;
  /** Saves changes to companies, creating them as needed; returns them as saved. */
  update(changes: (Partial<CompanyInfo> & { name: string })[]): Promise<CompanyInfo[]>;
}

const CompaniesCtx = createContext<Companies | null>(null);

function useCompanies(): Companies {
  const v = useContext(CompaniesCtx);
  if (!v) throw new Error('useCompanies outside <LeadsPage>');
  return v;
}

/** Jobs worth a look, before deciding to apply. Track one to start an application; dismiss the rest. */
export function LeadsPage() {
  const { leads, library, reloadLeads } = useOwnerData();
  const [filter, setFilter] = useState<LeadStatus>('new');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<FeedSettings | null>(null);
  const [sort, setSort] = useState<LeadSort>(() => (remembered('sort') as LeadSort | null) ?? 'match');
  const [grouped, setGrouped] = useState(() => remembered('grouped') === '1');

  useEffect(() => {
    loadFeedSettings().then(
      (s) => setSettings({ ...DEFAULT_FEED_SETTINGS, ...s }),
      () => setSettings(DEFAULT_FEED_SETTINGS),
    );
  }, []);
  useEffect(() => remember('sort', sort), [sort]);
  useEffect(() => remember('grouped', grouped ? '1' : '0'), [grouped]);

  const [companyMap, setCompanyMap] = useState<Map<string, CompanyInfo> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listCompanies().then(
      (list) => setCompanyMap(new Map(list.map((c) => [c.key, c]))),
      (e: unknown) => {
        setCompanyMap(new Map());
        setError(`Couldn't load companies: ${String(e)}`);
      },
    );
  }, []);
  // Latest map for async work that outlives a render.
  const companyRef = useRef(companyMap);
  companyRef.current = companyMap;
  const companies = useMemo<Companies>(
    () => ({
      get: (company) => companyMap?.get(companyKey(company)),
      update: async (changes) => {
        const merged = changes.map((c) => {
          const key = companyKey(c.name);
          return { ...(companyRef.current?.get(key) ?? { key }), ...c, key } as CompanyInfo;
        });
        await saveCompanies(merged);
        setCompanyMap((m) => {
          const next = new Map(m);
          for (const c of merged) next.set(c.key, c);
          return next;
        });
        return merged;
      },
    }),
    [companyMap],
  );
  const lookup = useFameLookup(leads, companyMap, companies);

  const prefs = useMemo(() => matchPrefs(settings ?? DEFAULT_FEED_SETTINGS, library, companyMap ?? new Map()), [settings, library, companyMap]);
  const isHidden = useCallback((l: Lead) => !!companyMap?.get(companyKey(l.company))?.hidden, [companyMap]);
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter((l) => l.status === filter && !isHidden(l))
      .filter((l) => !q || [l.company, l.role, l.location ?? '', l.source].some((t) => t.toLowerCase().includes(q)));
  }, [leads, filter, search, isHidden]);
  const hiddenCompanies = useMemo(() => [...(companyMap?.values() ?? [])].filter((c) => c.hidden).sort((a, b) => a.name.localeCompare(b.name)), [companyMap]);
  const sorted = useMemo(() => sortLeads(shown, sort, prefs), [shown, sort, prefs]);
  const groups = useMemo(() => (grouped ? groupByCompany(sorted) : null), [grouped, sorted]);
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s && !isHidden(l)).length;

  async function dismissShown() {
    setConfirmDismiss(false);
    try {
      await saveLeads(shown.map((l) => ({ ...l, status: 'dismissed' as const })));
      await reloadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!companyMap) return <p className="pad muted">Loading…</p>;

  return (
    <CompaniesCtx.Provider value={companies}>
    <div className="pad">
      <div className="page-head">
        <h1>Leads</h1>
        <span className="spacer" />
        {!adding && <button onClick={() => setAdding(true)}>+ Add lead</button>}
      </div>
      <p className="muted">
        Jobs worth a look, before you decide to apply. Track one to start an application with its posting; dismiss the
        rest.
      </p>

      {settings && (
        <ImportPanel
          settings={settings}
          onSettings={setSettings}
          hidden={(company) => !!companyMap.get(companyKey(company))?.hidden}
          onImported={() => {
            setFilter('new');
            lookup.start();
          }}
          lookupStatus={lookup.status}
        />
      )}
      {adding && <AddLead onClose={() => setAdding(false)} />}

      <div className="lead-toolbar">
        <div className="chips">
          {(['new', 'tracked', 'dismissed'] as LeadStatus[]).map((s) => (
            <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
              {STATUS_LABELS[s]} <span className="muted small">{count(s)}</span>
            </button>
          ))}
        </div>
        <input className="lead-search" type="search" value={search} placeholder="Filter by company, role, place…" onChange={(e) => setSearch(e.target.value)} />
        <select className="lead-sort" value={sort} onChange={(e) => setSort(e.target.value as LeadSort)} title="Sort">
          {(Object.keys(SORT_LABELS) as LeadSort[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <label className="check small">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by company
        </label>
        {filter === 'new' && shown.length > 1 &&
          (confirmDismiss ? (
            <span className="small">
              Dismiss these {shown.length}?{' '}
              <button className="link" onClick={() => void dismissShown()}>
                Dismiss
              </button>
              <button className="link" onClick={() => setConfirmDismiss(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="link small" onClick={() => setConfirmDismiss(true)}>
              Dismiss all shown
            </button>
          ))}
      </div>
      {error && <p className="error small">{error}</p>}
      {hiddenCompanies.length > 0 && (
        <p className="muted small">
          {hiddenCompanies.length} hidden compan{hiddenCompanies.length === 1 ? 'y' : 'ies'}{' '}
          <button className="link small" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Close' : 'Show'}
          </button>
          {showHidden &&
            hiddenCompanies.map((c) => (
              <span key={c.key} className="hidden-company">
                {c.name}{' '}
                <button className="link small" onClick={() => void companies.update([{ name: c.name, hidden: false }])}>
                  Unhide
                </button>
              </span>
            ))}
        </p>
      )}
      {sort === 'known' && lookup.pending > 0 && !lookup.running && (
        <p className="muted small">
          {lookup.pending} compan{lookup.pending === 1 ? 'y' : 'ies'} not looked up on Wikipedia yet.{' '}
          <button className="link small" onClick={lookup.start}>
            Look up now
          </button>
        </p>
      )}
      {sort === 'match' && !prefs.prefer.length && !prefs.places.length && (
        <p className="muted small">Best match uses your resume's skills and FAANG+/Quant for now. Add title words and places under Filters → Best match.</p>
      )}

      {leads.length === 0 && <p className="muted">No leads yet. Import from the job lists, or add one when you spot a job.</p>}
      {leads.length > 0 && shown.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="version-list">
        {groups
          ? groups.map((g) => <CompanyGroup key={g.company} company={g.company} leads={g.items} prefs={prefs} />)
          : sorted.map((l) => <LeadRow key={l.id} lead={l} prefs={prefs} />)}
      </div>
    </div>
    </CompaniesCtx.Provider>
  );
}

/**
 * Looks up how well known the companies of new leads are, in the background: their Wikipedia articles
 * in one query, then each article's views a second apart (Wikimedia rate-limits clients that hurry).
 * Saved as it goes, so leaving the page loses nothing; starts by itself when something is missing.
 */
function useFameLookup(leads: Lead[], companyMap: Map<string, CompanyInfo> | null, companies: Companies) {
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const latest = useRef({ leads, companyMap, companies });
  latest.current = { leads, companyMap, companies };

  const pendingOf = useCallback((map: Map<string, CompanyInfo>, all: Lead[]) => {
    const month = lastMonth();
    const byKey = new Map<string, Lead>();
    for (const l of all) if (l.status === 'new' && l.company) byKey.set(companyKey(l.company), l);
    const articles: Lead[] = [];
    const views: CompanyInfo[] = [];
    for (const [key, lead] of byKey) {
      const c = map.get(key);
      if (c?.hidden) continue;
      if (c?.article === undefined) articles.push(lead);
      else if (c.article && c.viewsMonth !== month) views.push(c);
    }
    return { articles, views };
  }, []);

  const pending = useMemo(() => {
    if (!companyMap) return 0;
    const p = pendingOf(companyMap, leads);
    return p.articles.length + p.views.length;
  }, [companyMap, leads, pendingOf]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    void (async () => {
      try {
        // Wait a tick so a just-finished import's leads are in `latest`.
        await new Promise((r) => setTimeout(r, 0));
        const { leads: all, companyMap: loaded } = latest.current;
        if (!loaded) return;
        const map = new Map(loaded);
        const { articles } = pendingOf(map, all);
        if (articles.length) {
          setStatus(`Finding ${articles.length} compan${articles.length === 1 ? 'y' : 'ies'} on Wikipedia…`);
          const found = await findArticles(articles.map((l) => ({ name: l.company, hints: domainHints(l) })));
          const now = Date.now();
          const saved = await latest.current.companies.update(
            articles.map((l) => {
              const m = found.get(companyKey(l.company));
              return m ? { name: l.company, article: m.article, langs: m.langs, matchedBy: m.matchedBy, checkedAt: now } : { name: l.company, article: null, checkedAt: now };
            }),
          );
          for (const c of saved) map.set(c.key, c);
        }
        // Views for every matched company still missing last month's.
        const { views } = pendingOf(map, all);
        const month = lastMonth();
        for (let i = 0; i < views.length && alive.current; i++) {
          setStatus(`Wikipedia views ${i + 1}/${views.length}…`);
          const c = views[i];
          const n = await monthlyViews(c.article!, month);
          await latest.current.companies.update([{ name: c.name, views: n ?? 0, viewsMonth: month }]);
          await new Promise((r) => setTimeout(r, 1100));
        }
        setStatus('');
      } catch (e) {
        setStatus(e instanceof RateLimited ? e.message : `Wikipedia lookup stopped: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        runningRef.current = false;
        if (alive.current) setRunning(false);
      }
    })();
  }, [pendingOf]);

  // Start by itself once companies are loaded and something is missing.
  const started = useRef(false);
  useEffect(() => {
    if (companyMap && pending > 0 && !started.current) {
      started.current = true;
      start();
    }
  }, [companyMap, pending, start]);

  return { status, running, pending, start };
}

/** Pulls new jobs from the public lists into leads, with filters kept in owner/leadFeeds. */
function ImportPanel({
  settings,
  onSettings: setSettings,
  hidden,
  onImported,
  lookupStatus,
}: {
  settings: FeedSettings;
  onSettings(s: FeedSettings): void;
  hidden(company: string): boolean;
  onImported(): void;
  lookupStatus: string;
}) {
  const { leads, applications, reloadLeads } = useOwnerData();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const enabled = FEEDS.filter((f) => settings.feeds.includes(f.id));

  async function run(s: FeedSettings) {
    setBusy(`Fetching ${enabled.length} list${enabled.length === 1 ? '' : 's'}…`);
    setResult('');
    setErrors([]);
    try {
      const now = Date.now();
      const fetched = await Promise.allSettled(
        enabled.map((f) => (f.kind === 'linkedin' ? gmailToken().then((t) => fetchLinkedInAlerts(t, s.maxAgeDays)) : fetchFeed(f, now))),
      );
      if (fetched.some((r) => r.status === 'rejected' && r.reason instanceof GmailAuthExpired)) forgetGmailToken();
      const failed = fetched.flatMap((r, i) => (r.status === 'rejected' ? [`${enabled[i].label}: ${String(r.reason)}`] : []));
      const jobs = fetched.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      setErrors(failed);
      if (failed.length === enabled.length) return;
      const wanted = withoutKnownLinkedIn(filterJobs(jobs, s, now), { leads, applications }).filter((j) => !hidden(j.company));
      const plan = planImport(wanted, { leads, applications }, () => newId('l'), now, companyFacts(jobs));
      setBusy(`Saving ${plan.leads.length} leads…`);
      await saveLeads([...plan.leads, ...plan.updated]);
      const next = { ...s, lastImportAt: now };
      await saveFeedSettings(next);
      setSettings(next);
      await reloadLeads();
      setResult(
        `Added ${plan.leads.length} new lead${plan.leads.length === 1 ? '' : 's'} from ${plan.matched} matching job${plan.matched === 1 ? '' : 's'}` +
          (plan.known ? ` (${plan.known} already seen).` : '.'),
      );
      onImported();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="card import-panel">
      <div className="import-head">
        <button className="primary" disabled={!!busy || !enabled.length} onClick={() => void run(settings)}>
          {busy || 'Import new jobs'}
        </button>
        <span className="muted small grow-text">
          {enabled.length ? `From ${enabled.map((f) => f.label).join(', ')}` : 'No lists chosen'}
          {settings.lastImportAt ? ` · last ${fmtDateTime(settings.lastImportAt)}` : ''}
        </span>
        <button className="link small" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Close filters' : 'Filters'}
        </button>
      </div>
      {result && <p className="ok-text small">{result}</p>}
      {lookupStatus && <p className="muted small">{lookupStatus}</p>}
      {errors.map((e) => (
        <p key={e} className="error small">
          {e}
        </p>
      ))}
      {editing && (
        <ImportSettings
          settings={settings}
          onSave={async (s) => {
            await saveFeedSettings(s);
            setSettings(s);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function ImportSettings({ settings, onSave }: { settings: FeedSettings; onSave(s: FeedSettings): Promise<void> }) {
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const patch = (p: Partial<FeedSettings>) => setS((x) => ({ ...x, ...p }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="import-settings">
      <fieldset>
        <legend>Lists</legend>
        {FEEDS.map((f) => (
          <label key={f.id} className="check">
            <input type="checkbox" checked={s.feeds.includes(f.id)} onChange={() => patch({ feeds: toggle(s.feeds, f.id) })} />
            {f.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>
          Categories <span className="muted small">(none ticked keeps all)</span>
        </legend>
        <div className="chips">
          {Object.keys(CATEGORIES).map((c) => (
            <button key={c} className={`chip ${s.categories.includes(c) ? 'on' : ''}`} onClick={() => patch({ categories: toggle(s.categories, c) })}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="two">
        <label>
          Terms <span className="muted small">(comma-separated)</span>
          <input
            value={s.terms.join(', ')}
            placeholder="Summer 2027, Fall 2027"
            onChange={(e) => patch({ terms: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          />
        </label>
        <label>
          Posted within (days)
          <input type="number" min={1} max={120} value={s.maxAgeDays} onChange={(e) => patch({ maxAgeDays: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>
      <div className="two">
        <label>
          Title has one of
          <input value={s.include} placeholder="software, backend, full stack" onChange={(e) => patch({ include: e.target.value })} />
        </label>
        <label>
          Skip titles with
          <input value={s.exclude} placeholder="PhD, High School" onChange={(e) => patch({ exclude: e.target.value })} />
        </label>
      </div>
      <label>
        Location has one of
        <input value={s.locations} placeholder="New York, Remote, Seattle (empty: anywhere)" onChange={(e) => patch({ locations: e.target.value })} />
      </label>
      <fieldset>
        <legend>
          Best match <span className="muted small">(ranks leads; doesn't hide any)</span>
        </legend>
        <div className="two">
          <label>
            Rank higher: title words
            <input value={s.prefer} placeholder="backend, full stack, new grad" onChange={(e) => patch({ prefer: e.target.value })} />
          </label>
          <label>
            Rank higher: places
            <input value={s.preferPlaces} placeholder="New York, Remote" onChange={(e) => patch({ preferPlaces: e.target.value })} />
          </label>
        </div>
        <p className="muted small">Skills from Experience &amp; skills found in a title and FAANG+/Quant/🔥 companies also count, a little less.</p>
      </fieldset>
      <p className="muted small">
        A filter only applies where a list gives what it checks: SpeedyApply and negarprh have no categories, a
        term counts only when the job names one, and hanzili has no posting dates. Dismissed leads stay dismissed:
        importing again never brings them back.
      </p>
      <div className="btn-row">
        <button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            onSave(s).catch((e: unknown) => {
              setError(e instanceof Error ? e.message : String(e));
              setSaving(false);
            });
          }}
        >
          {saving ? 'Saving…' : 'Save filters'}
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

/** A company's leads under one heading: the best one shown, the rest behind "more". */
function CompanyGroup({ company, leads, prefs }: { company: string; leads: Lead[]; prefs: MatchPrefs }) {
  const [open, setOpen] = useState(false);
  if (leads.length === 1) return <LeadRow lead={leads[0]} prefs={prefs} />;
  return (
    <div className="lead-group">
      <div className="lead-group-head small">
        <StarButton company={company} />
        <strong>{company}</strong> <span className="muted">· {leads.length} leads</span>
      </div>
      {(open ? leads : leads.slice(0, 1)).map((l) => (
        <LeadRow key={l.id} lead={l} prefs={prefs} />
      ))}
      <button className="link small" onClick={() => setOpen((o) => !o)}>
        {open ? 'Show fewer' : `+ ${leads.length - 1} more from ${company}`}
      </button>
    </div>
  );
}

function StarButton({ company }: { company: string }) {
  const companies = useCompanies();
  const starred = !!companies.get(company)?.starred;
  return (
    <button
      className={`star ${starred ? 'on' : ''}`}
      title={starred ? `Unstar ${company}` : `Star ${company}: always first`}
      aria-pressed={starred}
      onClick={() => void companies.update([{ name: company, starred: !starred }])}
    >
      {starred ? '★' : '☆'}
    </button>
  );
}

/** "29k Wikipedia views/mo", with a way to fix a wrong match. */
function Fame({ company }: { company: string }) {
  const companies = useCompanies();
  const info = companies.get(company);
  const [fixing, setFixing] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = fameLabel(info);

  async function save(article: string | null) {
    setBusy(true);
    setError('');
    try {
      const month = lastMonth();
      const views = article ? await monthlyViews(article, month) : null;
      await companies.update([
        { name: company, article, matchedBy: 'manual', checkedAt: Date.now(), langs: undefined, ...(article ? { views: views ?? 0, viewsMonth: month } : { views: undefined, viewsMonth: undefined }) },
      ]);
      setFixing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (fixing) {
    const article = articleFromUrl(link);
    return (
      <span className="fame-fix">
        <input value={link} autoFocus placeholder="https://en.wikipedia.org/wiki/…" onChange={(e) => setLink(e.target.value)} />
        <button disabled={busy || !article} onClick={() => void save(article)}>
          Use this
        </button>
        <button className="link small" disabled={busy} onClick={() => void save(null)}>
          Not on Wikipedia
        </button>
        <button className="link small" onClick={() => setFixing(false)}>
          Cancel
        </button>
        {error && <span className="error small">{error}</span>}
      </span>
    );
  }
  if (!label) return null;
  return (
    <span>
      {info?.article ? (
        <a href={articleUrl(info.article)} target="_blank" rel="noopener noreferrer" title={`Wikipedia: ${info.article}`}>
          {label}
        </a>
      ) : (
        label
      )}{' '}
      <button className="link small" title="Wrong article? Pick the right one." onClick={() => setFixing(true)}>
        fix
      </button>
    </span>
  );
}

function LeadRow({ lead, prefs }: { lead: Lead; prefs: MatchPrefs }) {
  const { reloadLeads, reloadApplications, applications, versions } = useOwnerData();
  const companies = useCompanies();
  const application = lead.applicationId ? applications.find((a) => a.id === lead.applicationId) : undefined;
  const reasons = scoreLead(lead, prefs).reasons;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function setStatus(status: LeadStatus) {
    setBusy(true);
    try {
      await saveLead({ ...lead, status });
      await reloadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  /** Submitted it (by hand or with the autofill tools): record it as applied, with the kit's resume. */
  async function markApplied() {
    setBusy(true);
    setError('');
    try {
      const kitVersion = (await loadAnswers())?.kitVersionId;
      const versionId = versions.some((v) => v.id === kitVersion) ? kitVersion : versions.find((v) => v.isMain)?.id;
      const app = appliedFromLead(newId('a'), lead, versionId);
      await saveApplication(app);
      await saveLead({ ...lead, status: 'tracked', applicationId: app.id });
      await Promise.all([reloadApplications(), reloadLeads()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <article className={`card app-row ${lead.status === 'dismissed' ? 'closed' : ''}`}>
      <div className="version-head">
        <div className="grow-text">
          <h2>
            <StarButton company={lead.company} />
            <a href={lead.url} target="_blank" rel="noopener noreferrer">
              {lead.role || '(no role)'}
            </a>
            <span className="muted"> · {lead.company || '(no company)'}</span>
            {lead.tier && <span className="badge tiny">{TIER_LABELS[lead.tier]}</span>}
          </h2>
          <div className="muted small">
            {lead.postedAt ? `Posted ${fmtDate(lead.postedAt)}` : `Added ${fmtDate(lead.addedAt)}`}
            {lead.location && ` · ${lead.location}`}
            {lead.salary && ` · ${lead.salary}`}
            {` · via ${lead.source}`}
          </div>
          <div className="small lead-extra">
            {reasons.length > 0 && <span className="lead-reasons">Matches {reasons.join(', ')}</span>}
            <span className="muted">
              <Fame company={lead.company} />
            </span>
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
        <span className="spacer" />
        <div className="lead-actions">
          {lead.status === 'new' && (
            <>
              <button className="primary" disabled={busy} onClick={() => navigate(`/admin/applications/new?lead=${lead.id}`)}>
                Track
              </button>
              <button
                disabled={busy}
                title="Already submitted: record it as applied, with the resume from your last apply kit (or main)"
                onClick={() => void markApplied()}
              >
                Applied
              </button>
              <button disabled={busy} onClick={() => void setStatus('dismissed')}>
                Dismiss
              </button>
            </>
          )}
          {lead.status === 'new' && (
            <button
              className="link small"
              title={`Hide every lead from ${lead.company}, now and in later imports`}
              onClick={() => void companies.update([{ name: lead.company, hidden: true }])}
            >
              Hide company
            </button>
          )}
          {lead.status === 'dismissed' && (
            <button className="link" disabled={busy} onClick={() => void setStatus('new')}>
              Restore
            </button>
          )}
          {lead.status === 'tracked' &&
            (application ? <Link to={`/admin/applications/${application.id}`}>Application →</Link> : <span className="muted small">Application deleted</span>)}
        </div>
      </div>
    </article>
  );
}

function AddLead({ onClose }: { onClose(): void }) {
  const { leads, applications, reloadLeads } = useOwnerData();
  const [url, setUrl] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sources = useMemo(() => knownSources([...leads, ...applications]), [leads, applications]);
  const key = urlKey(url);
  const dupLead = key ? leads.find((l) => urlKey(l.url) === key) : undefined;
  const dupApp = key ? applications.find((a) => urlKey(a.url) === key) : undefined;

  async function add() {
    if (!key) return setError('Add the posting address (https://…).');
    if (!company.trim() && !role.trim()) return setError('Add at least the company or the role.');
    setSaving(true);
    setError('');
    try {
      await saveLead({
        id: newId('l'),
        url: url.trim(),
        company: company.trim(),
        role: role.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        source: source.trim() || 'Manual',
        addedAt: Date.now(),
        status: 'new',
      });
      await reloadLeads();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <section className="card add-lead">
      <label>
        Posting address
        <input
          value={url}
          autoFocus
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            const c = companyFromUrl(url.trim());
            if (c && !company.trim()) setCompany(c);
          }}
        />
      </label>
      <DuplicateNote lead={dupLead} application={dupApp} />
      <div className="two">
        <label>
          Company
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          Role
          <input value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <SourceField value={source} options={sources} onChange={setSource} />
      </div>
      <div className="btn-row">
        <button className="primary" disabled={saving} onClick={() => void add()}>
          {saving ? 'Adding…' : 'Add lead'}
        </button>
        <button className="link" onClick={onClose}>
          Cancel
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </section>
  );
}

/** "Found via", with what's been used before as suggestions. */
export function SourceField({ value, options, onChange }: { value: string; options: string[]; onChange(v: string): void }) {
  return (
    <label>
      Found via
      <input list="lead-sources" value={value} placeholder="LinkedIn, Referral…" onChange={(e) => onChange(e.target.value)} />
      <datalist id="lead-sources">
        {options.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}

/** Warns that this posting is already a lead or an application. */
export function DuplicateNote({ lead, application }: { lead?: Lead; application?: { id: string; role: string; company: string } }) {
  if (application) {
    return (
      <p className="notice small">
        Already an application:{' '}
        <Link to={`/admin/applications/${application.id}`}>
          {application.role || '(no role)'} · {application.company || '(no company)'}
        </Link>
      </p>
    );
  }
  if (lead) {
    return (
      <p className="notice small">
        Already a lead ({STATUS_LABELS[lead.status].toLowerCase()}): {lead.role || '(no role)'} · {lead.company || '(no company)'}
      </p>
    );
  }
  return null;
}

// Sort and grouping are per-browser conveniences; storage may be unavailable.
const STORE_KEY = 'resume-studio:leads:';

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(STORE_KEY + key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(STORE_KEY + key, value);
  } catch {
    // not remembered; fine
  }
}
