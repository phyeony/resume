import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FeedSettings, Lead, LeadStatus } from '../../model/types';
import { CATEGORIES, DEFAULT_FEED_SETTINGS, FEEDS, fetchFeed, filterJobs, planImport, tiersByCompany } from '../../applications/feeds';
import { SORT_LABELS, groupByCompany, matchPrefs, scoreLead, sortLeads, type LeadSort, type MatchPrefs } from '../../applications/leadSort';
import { urlKey } from '../../applications/model';
import { knownSources } from '../../applications/stats';
import { companyFromUrl } from '../../applications/summarize';
import { loadFeedSettings, newId, saveFeedSettings, saveLead, saveLeads } from './store';
import { useOwnerData } from './Admin';
import { fmtDate, fmtDateTime } from './format';
import './applications.css';

const STATUS_LABELS: Record<LeadStatus, string> = { new: 'New', tracked: 'Tracked', dismissed: 'Dismissed' };

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

  const prefs = useMemo(() => matchPrefs(settings ?? DEFAULT_FEED_SETTINGS, library), [settings, library]);
  const [adding, setAdding] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [error, setError] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter((l) => l.status === filter)
      .filter((l) => !q || [l.company, l.role, l.location ?? '', l.source].some((t) => t.toLowerCase().includes(q)));
  }, [leads, filter, search]);
  const sorted = useMemo(() => sortLeads(shown, sort, prefs), [shown, sort, prefs]);
  const groups = useMemo(() => (grouped ? groupByCompany(sorted) : null), [grouped, sorted]);
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s).length;

  async function dismissShown() {
    setConfirmDismiss(false);
    try {
      await saveLeads(shown.map((l) => ({ ...l, status: 'dismissed' as const })));
      await reloadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
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

      {settings && <ImportPanel settings={settings} onSettings={setSettings} onImported={() => setFilter('new')} />}
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
      {sort === 'match' && !prefs.prefer.length && !prefs.places.length && (
        <p className="muted small">Best match uses your resume's skills and FAANG+/Quant for now. Add title words and places under Filters → Best match.</p>
      )}

      {leads.length === 0 && <p className="muted">No leads yet. Import from the job lists, or add one when you spot a job.</p>}
      {leads.length > 0 && shown.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="version-list">
        {groups
          ? groups.map((g) => <CompanyGroup key={g.company} company={g.company} leads={g.leads} prefs={prefs} />)
          : sorted.map((l) => <LeadRow key={l.id} lead={l} prefs={prefs} />)}
      </div>
    </div>
  );
}

/** Pulls new jobs from the public lists into leads, with filters kept in owner/leadFeeds. */
function ImportPanel({ settings, onSettings: setSettings, onImported }: { settings: FeedSettings; onSettings(s: FeedSettings): void; onImported(): void }) {
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
      const fetched = await Promise.allSettled(enabled.map((f) => fetchFeed(f, now)));
      const failed = fetched.flatMap((r, i) => (r.status === 'rejected' ? [`${enabled[i].label}: ${String(r.reason)}`] : []));
      const jobs = fetched.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      setErrors(failed);
      if (failed.length === enabled.length) return;
      const plan = planImport(filterJobs(jobs, s, now), { leads, applications }, () => newId('l'), now, tiersByCompany(jobs));
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
          Simplify categories <span className="muted small">(none ticked keeps all)</span>
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
          Simplify terms <span className="muted small">(comma-separated)</span>
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
        <p className="muted small">Skills from Experience &amp; skills found in a title and FAANG+/Quant companies also count, a little less.</p>
      </fieldset>
      <p className="muted small">
        SpeedyApply lists only software jobs and doesn't say which term, so the category and term filters apply to
        Simplify only. Dismissed leads stay dismissed: importing again never brings them back.
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

function LeadRow({ lead, prefs }: { lead: Lead; prefs: MatchPrefs }) {
  const { reloadLeads, applications } = useOwnerData();
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

  return (
    <article className={`card app-row ${lead.status === 'dismissed' ? 'closed' : ''}`}>
      <div className="version-head">
        <div className="grow-text">
          <h2>
            <a href={lead.url} target="_blank" rel="noopener noreferrer">
              {lead.role || '(no role)'}
            </a>
            <span className="muted"> · {lead.company || '(no company)'}</span>
            {lead.tier && <span className="badge tiny">{lead.tier === 'faang' ? 'FAANG+' : 'Quant'}</span>}
          </h2>
          <div className="muted small">
            {lead.postedAt ? `Posted ${fmtDate(lead.postedAt)}` : `Added ${fmtDate(lead.addedAt)}`}
            {lead.location && ` · ${lead.location}`}
            {lead.salary && ` · ${lead.salary}`}
            {` · via ${lead.source}`}
          </div>
          {reasons.length > 0 && <div className="small lead-reasons">Matches {reasons.join(', ')}</div>}
          {error && <p className="error small">{error}</p>}
        </div>
        <span className="spacer" />
        <div className="lead-actions">
          {lead.status === 'new' && (
            <>
              <button className="primary" disabled={busy} onClick={() => navigate(`/admin/applications/new?lead=${lead.id}`)}>
                Track
              </button>
              <button disabled={busy} onClick={() => void setStatus('dismissed')}>
                Dismiss
              </button>
            </>
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
