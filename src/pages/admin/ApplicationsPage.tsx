import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STAGES, STAGE_LABELS, type Application, type Stage } from '../../model/types';
import { appliedAt, currentStage, isClosed, lastEventAt, waitingDays, withFollowUp, withStage } from '../../applications/model';
import { groupByCompany } from '../../applications/leadSort';
import { saveApplication, viewStats, type ViewStats } from './store';
import { useOwnerData } from './Admin';
import { fmtDate } from './format';
import './applications.css';

type Filter = 'active' | 'all' | 'follow-up' | Stage;

const needsFollowUp = (a: Application) => !isClosed(currentStage(a)) && waitingDays(a) !== null;

/** Every word of the query appears somewhere in the application: "shopify backend" finds that one. */
function matchesSearch(a: Application, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [a.company, a.role, a.summary.location, a.summary.salary?.text, a.source, a.notes, STAGE_LABELS[currentStage(a)]].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

const WORK_MODE: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

/** Every job applied to (or saved to apply to), with where each one stands. */
export function ApplicationsPage() {
  const { applications, reloadApplications } = useOwnerData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(() => remembered('grouped') === '1');
  useEffect(() => remember('grouped', grouped ? '1' : '0'), [grouped]);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setSure(false), [filter]);

  async function markAllApplied(saved: Application[]) {
    setBusy(true);
    setError('');
    try {
      const now = Date.now();
      await Promise.all(saved.map((a) => saveApplication(withStage(a, 'applied', now))));
      await reloadApplications();
      setFilter('applied');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setSure(false);
    }
  }

  const counts = useMemo(() => {
    const c = new Map<Stage, number>();
    for (const a of applications) c.set(currentStage(a), (c.get(currentStage(a)) ?? 0) + 1);
    return c;
  }, [applications]);

  const shown = useMemo(
    () =>
      applications
        .filter((a) => {
          const s = currentStage(a);
          if (filter === 'all') return true;
          if (filter === 'active') return !isClosed(s);
          if (filter === 'follow-up') return needsFollowUp(a);
          return s === filter;
        })
        .filter((a) => matchesSearch(a, search))
        .sort((a, b) => lastEventAt(b) - lastEventAt(a)),
    [applications, filter, search],
  );
  const groups = useMemo(() => (grouped ? groupByCompany(shown) : null), [grouped, shown]);

  const activeCount = applications.filter((a) => !isClosed(currentStage(a))).length;
  const followUpCount = applications.filter(needsFollowUp).length;

  return (
    <div className="pad">
      <div className="page-head">
        <h1>Applications</h1>
        <span className="spacer" />
        <button onClick={() => navigate('/admin/applications/stats')}>Stats</button>
        <button className="primary" onClick={() => navigate('/admin/applications/new')}>
          + New application
        </button>
      </div>
      <p className="muted">
        Each application keeps an exact copy of its job posting, so it's still here if the company takes it down.
      </p>

      <div className="chips stage-filter">
        <FilterChip on={filter === 'active'} onClick={() => setFilter('active')} label="Active" count={activeCount} />
        {(followUpCount > 0 || filter === 'follow-up') && (
          <FilterChip on={filter === 'follow-up'} onClick={() => setFilter('follow-up')} label="Follow up" count={followUpCount} />
        )}
        <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} label="All" count={applications.length} />
        {STAGES.filter((s) => counts.get(s)).map((s) => (
          <FilterChip key={s} on={filter === s} onClick={() => setFilter(s)} label={STAGE_LABELS[s]} count={counts.get(s)!} />
        ))}
      </div>
      <div className="lead-toolbar">
        <input className="lead-search" type="search" value={search} placeholder="Search applications…" title="Company, role, place, salary, source, notes or stage" onChange={(e) => setSearch(e.target.value)} />
        <label className="check small">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by company
        </label>
      </div>

      {filter === 'saved' && shown.length > 0 && (
        <div className="btn-row">
          {sure ? (
            <>
              <span className="muted small">Mark {shown.length} saved as applied today?</span>
              <button className="primary" disabled={busy} onClick={() => void markAllApplied(shown)}>
                {busy ? 'Saving…' : `Yes, mark ${shown.length} applied`}
              </button>
              <button disabled={busy} onClick={() => setSure(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setSure(true)}>Mark all {shown.length} as applied</button>
          )}
          {error && <span className="error small">{error}</span>}
        </div>
      )}

      {applications.length === 0 && (
        <p className="muted">No applications yet. Add one when you find a job you like, before you apply.</p>
      )}
      {applications.length > 0 && shown.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="version-list">
        {groups
          ? groups.map((g) =>
              g.items.length === 1 ? (
                <ApplicationRow key={g.items[0].id} app={g.items[0]} />
              ) : (
                <div key={g.company} className="lead-group app-group">
                  <div className="lead-group-head small">
                    <strong>{g.company}</strong> <span className="muted">· {g.items.length} applications</span>
                  </div>
                  {g.items.map((a) => (
                    <ApplicationRow key={a.id} app={a} />
                  ))}
                </div>
              ),
            )
          : shown.map((a) => <ApplicationRow key={a.id} app={a} />)}
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, label, count }: { on: boolean; onClick(): void; label: string; count: number }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} onClick={onClick}>
      {label} <span className="muted small">{count}</span>
    </button>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`stage stage-${stage}`}>{STAGE_LABELS[stage]}</span>;
}

function ApplicationRow({ app }: { app: Application }) {
  const { links, reloadApplications } = useOwnerData();
  const [busy, setBusy] = useState(false);
  const stage = currentStage(app);
  const applied = appliedAt(app);
  const waiting = waitingDays(app);
  const link = app.linkSlug ? links.find((l) => l.slug === app.linkSlug) : undefined;
  const [stats, setStats] = useState<ViewStats | null>(null);
  useEffect(() => {
    if (link) viewStats(link.slug).then(setStats, () => setStats(null));
  }, [link]);

  const s = app.summary;
  const where = [s.location, s.workMode && WORK_MODE[s.workMode]].filter(Boolean).join(' · ');

  return (
    <article className={`card app-row ${isClosed(stage) ? 'closed' : ''}`}>
      <div className="version-head">
        <div className="grow-text">
          <h2>
            <Link to={`/admin/applications/${app.id}`}>{app.role || '(no role)'}</Link>
            <span className="muted"> · {app.company || '(no company)'}</span>
          </h2>
          <div className="muted small">
            {applied ? `Applied ${fmtDate(applied)}` : `Saved ${fmtDate(app.createdAt)}`}
            {where && ` · ${where}`}
            {s.salary?.text && ` · ${s.salary.text}`}
            {app.source && ` · via ${app.source}`}
          </div>
        </div>
        <span className="spacer" />
        <div className="app-side">
          <StageBadge stage={stage} />
          {waiting !== null && (
            <div className="small">
              <span className="warn-text">No update in {waiting} days</span>{' '}
              <button
                className="link small"
                disabled={busy}
                title="Sent a follow-up today: start the wait over"
                onClick={() => {
                  setBusy(true);
                  saveApplication(withFollowUp(app))
                    .then(reloadApplications)
                    .finally(() => setBusy(false));
                }}
              >
                Followed up
              </button>
            </div>
          )}
          {link && (
            <div className="muted small">
              /{link.slug}:{' '}
              {stats === null ? '…' : stats.views ? `${stats.views} view${stats.views === 1 ? '' : 's'}` : 'not opened'}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// Grouping is a per-browser convenience; storage may be unavailable.
const STORE_KEY = 'resume-studio:applications:';

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
