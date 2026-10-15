import { useEffect, useMemo, useState, type ClipboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { STAGES, STAGE_LABELS, type Application, type Lead, type Posting, type PostingSummary, type Stage, type WorkMode } from '../../model/types';
import { capturePosting, sanitize, type Capture } from '../../applications/capture';
import { companyFromUrl, summarize } from '../../applications/summarize';
import { parseSalary } from '../../applications/salary';
import { currentStage, isSummaryEmpty, newApplication, nextStage, sortHistory, urlKey } from '../../applications/model';
import { knownSources } from '../../applications/stats';
import { createLink, deleteApplication, getPosting, makeSlug, newId, saveApplication, saveLead, viewStats, type ViewStats } from './store';
import { useOwnerData } from './Admin';
import { StageBadge } from './ApplicationsPage';
import { DuplicateNote, SourceField } from './LeadsPage';
import { fmtDate, fmtDateTime, fromDateInput, toDateInput } from './format';
import './applications.css';

const LIST_FIELDS: { key: 'responsibilities' | 'requirements' | 'niceToHave' | 'benefits'; label: string }[] = [
  { key: 'responsibilities', label: "What you'd do" },
  { key: 'requirements', label: 'Requirements' },
  { key: 'niceToHave', label: 'Nice to have' },
  { key: 'benefits', label: 'Benefits' },
];

/** One application: capture its posting, review the filled-in fields, track its stages. */
export function ApplicationEditor() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const { applications, leads, reloadApplications, reloadLeads } = useOwnerData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /** Tracking a lead: it becomes this application. */
  const lead = isNew ? leads.find((l) => l.id === params.get('lead')) : undefined;

  const stored = applications.find((a) => a.id === id);
  const [app, setApp] = useState<Application>(() => stored ?? fromLead(newApplication(newId('a')), lead));
  const [posting, setPosting] = useState<Posting | null>(null);
  const [postingLoaded, setPostingLoaded] = useState(isNew || !stored?.hasPosting);
  /** A fresh paste not saved yet: the blocks to choose from. */
  const [capture, setCapture] = useState<Capture | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [recapturing, setRecapturing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew || !stored?.hasPosting) return;
    getPosting(id).then(
      (p) => {
        setPosting(p);
        setPostingLoaded(true);
      },
      (e) => setError(`Couldn't load the posting: ${String(e)}`),
    );
  }, [id, isNew, stored?.hasPosting]);

  if (!isNew && !stored) {
    return (
      <div className="pad">
        <p className="muted">This application doesn't exist (it may have been deleted).</p>
      </div>
    );
  }

  const patch = (p: Partial<Application>) => {
    setApp((a) => ({ ...a, ...p }));
    setDirty(true);
  };
  const patchSummary = (p: Partial<PostingSummary>) => patch({ summary: { ...app.summary, ...p } });

  async function pickBlock(c: Capture, index: number, fillSummary: boolean) {
    const block = c.blocks[index];
    setBlockIndex(index);
    setPosting({ html: block.html, text: block.text, capturedAt: Date.now(), method: block.method });
    setDirty(true);
    const draft = await summarize({ capture: c, block, url: app.url });
    setApp((a) => ({
      ...a,
      company: a.company || draft.company,
      role: a.role || draft.role,
      ...(fillSummary ? { summary: draft.summary } : {}),
    }));
  }

  function onPaste(e: ClipboardEvent) {
    e.preventDefault();
    const c = capturePosting({ html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain') });
    if (!c) return setError('Nothing to read in what was pasted.');
    setError('');
    setCapture(c);
    setRecapturing(false);
    void pickBlock(c, 0, isSummaryEmpty(app.summary) || app.summary.filledBy === 'rules');
  }

  async function refill() {
    if (!posting) return;
    const c = capture ?? { blocks: [{ html: posting.html, text: posting.text, method: posting.method, label: '' }] };
    const draft = await summarize({ capture: c, block: c.blocks[capture ? blockIndex : 0], url: app.url });
    patch({ summary: draft.summary });
  }

  async function save() {
    if (!app.company.trim() && !app.role.trim()) return setError('Add at least the company or the role.');
    setSaving(true);
    setError('');
    try {
      const next: Application = { ...app, company: app.company.trim(), role: app.role.trim(), hasPosting: !!posting, updatedAt: Date.now() };
      await saveApplication(next, capture && posting ? posting : undefined);
      if (lead) await saveLead({ ...lead, status: 'tracked', applicationId: next.id });
      await Promise.all([reloadApplications(), lead ? reloadLeads() : null]);
      setDirty(false);
      setCapture(null);
      if (isNew) navigate(`/admin/applications/${next.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteApplication(app.id);
      await reloadApplications();
      navigate('/admin/applications');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const showPaste = postingLoaded && (!posting || recapturing);
  const s = app.summary;
  const key = urlKey(app.url);
  const dupApp = key ? applications.find((a) => a.id !== app.id && urlKey(a.url) === key) : undefined;
  const dupLead = key && !lead ? leads.find((l) => l.status !== 'tracked' && urlKey(l.url) === key) : undefined;

  return (
    <div className="pad app-editor">
      <div className="page-head sticky">
        <button className="link" onClick={() => navigate('/admin/applications')}>
          ← Applications
        </button>
        <h1>{isNew ? 'New application' : app.role || app.company || 'Application'}</h1>
        {!isNew && <StageBadge stage={currentStage(app)} />}
        <span className="spacer" />
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="primary" disabled={saving || (!dirty && !isNew)} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="error small">{error}</p>}

      <div className="app-grid">
        {/* ---- the posting ---- */}
        <section className="card posting-card">
          <label>
            Posting address
            <input
              value={app.url ?? ''}
              placeholder="https://…"
              onChange={(e) => patch({ url: e.target.value.trim() || undefined })}
              onBlur={() => {
                const c = companyFromUrl(app.url);
                if (c && !app.company.trim()) patch({ company: c });
              }}
              onPaste={(e) => {
                // The whole job page pasted here by mistake: treat it as the posting.
                const text = e.clipboardData.getData('text/plain');
                if (showPaste && (/\s/.test(text.trim()) || text.length > 2000)) onPaste(e);
              }}
            />
          </label>
          {app.url && /^https?:\/\//.test(app.url) && (
            <a className="small" href={app.url} target="_blank" rel="noopener noreferrer">
              Open posting ↗
            </a>
          )}
          <DuplicateNote application={dupApp} lead={dupLead} />

          {showPaste && (
            <div className="paste-zone">
              <textarea
                className="paste-target"
                placeholder="Paste the job posting here (⌘V)"
                value=""
                onChange={() => {}}
                onPaste={onPaste}
                autoFocus={isNew}
              />
              <p className="muted small">
                On the job page press <kbd>⌘A</kbd> then <kbd>⌘C</kbd> to copy everything, then paste here. The posting
                is picked out and kept exactly as written. If it picks the wrong part, select just the posting on the
                page and copy that instead. Pasting the page source (<kbd>⌥⌘U</kbd>) also works and often fills in
                more.
              </p>
              {recapturing && (
                <button className="link small" onClick={() => setRecapturing(false)}>
                  Keep the current copy
                </button>
              )}
            </div>
          )}

          {posting && !recapturing && (
            <>
              <div className="posting-head">
                <span className="muted small">
                  {capture ? 'Captured just now · not saved yet' : `Captured ${fmtDateTime(posting.capturedAt)}`}
                </span>
                <span className="spacer" />
                {capture && capture.blocks.length > 1 && (
                  <select
                    className="block-pick"
                    value={blockIndex}
                    onChange={(e) => void pickBlock(capture, Number(e.target.value), true)}
                    title="Wrong part of the page? Pick another block."
                  >
                    {capture.blocks.map((b, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'Best match: ' : b.method === 'page' ? 'Whole page: ' : b.method === 'wider' ? 'More around it: ' : 'Other: '}
                        {b.label}
                      </option>
                    ))}
                  </select>
                )}
                {!capture && (
                  <button className="link small" onClick={() => setRecapturing(true)}>
                    Replace copy
                  </button>
                )}
              </div>
              <PostingView html={posting.html} />
            </>
          )}
          {!postingLoaded && <p className="muted small">Loading posting…</p>}
          {recapturing && posting && (
            <p className="notice small">Paste a new copy above. The saved copy is only replaced when you save.</p>
          )}
        </section>

        {/* ---- the details ---- */}
        <div className="app-side-col">
          <section className="card">
            <div className="two">
              <label>
                Company
                <input value={app.company} onChange={(e) => patch({ company: e.target.value })} />
              </label>
              <label>
                Role
                <input value={app.role} onChange={(e) => patch({ role: e.target.value })} />
              </label>
            </div>
            <div className="two">
              <label>
                Location
                <input value={s.location ?? ''} onChange={(e) => patchSummary({ location: e.target.value || undefined })} />
              </label>
              <label>
                Work mode
                <select
                  value={s.workMode ?? ''}
                  onChange={(e) => patchSummary({ workMode: (e.target.value || undefined) as WorkMode | undefined })}
                >
                  <option value="">—</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
            </div>
            <SalaryField summary={s} onChange={patchSummary} />
            {LIST_FIELDS.map((f) => (
              <ListField key={f.key} label={f.label} items={s[f.key]} onChange={(items) => patchSummary({ [f.key]: items })} />
            ))}
            <div className="btn-row">
              <span className="muted small">
                {s.filledBy === 'rules' ? 'Filled in from the posting by pattern matching. Check it.' : 'Filled in by hand.'}
              </span>
              {posting && (
                <button className="link small" onClick={() => void refill()}>
                  Refill from posting
                </button>
              )}
            </div>
          </section>

          <StageSection app={app} onChange={(history) => patch({ history })} />
          <ResumeSection app={app} onChange={patch} />

          <section className="card">
            <SourceField
              value={app.source ?? ''}
              options={knownSources([...applications, ...leads])}
              onChange={(v) => patch({ source: v || undefined })}
            />
            <label>
              Notes
              <textarea rows={4} value={app.notes ?? ''} placeholder="Recruiter, referral, interview prep…" onChange={(e) => patch({ notes: e.target.value || undefined })} />
            </label>
          </section>

          {!isNew && (
            <div className="danger-row">
              {confirmDelete ? (
                <>
                  <span className="small">Delete this application and its saved posting? This can't be undone.</span>
                  <button className="danger" disabled={saving} onClick={() => void remove()}>
                    Delete
                  </button>
                  <button className="link" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="link danger-text" onClick={() => setConfirmDelete(true)}>
                  Delete application
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A new application filled in from the lead it tracks. */
function fromLead(a: Application, lead: Lead | undefined): Application {
  if (!lead) return a;
  return {
    ...a,
    company: lead.company,
    role: lead.role,
    url: lead.url,
    source: lead.source,
    summary: { ...a.summary, ...(lead.location ? { location: lead.location } : {}) },
  };
}

/** The captured posting, read-only. Sanitized again on the way out, in case stored data was edited. */
function PostingView({ html }: { html: string }) {
  const safe = useMemo(() => sanitize(html), [html]);
  return <div className="posting" dangerouslySetInnerHTML={{ __html: safe }} />;
}

function SalaryField({ summary, onChange }: { summary: PostingSummary; onChange(p: Partial<PostingSummary>): void }) {
  const [text, setText] = useState(summary.salary?.text ?? '');
  useEffect(() => setText(summary.salary?.text ?? ''), [summary.salary?.text]);
  return (
    <label>
      Salary
      <input
        value={text}
        placeholder="e.g. $120,000 – $150,000 CAD / year"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (t === (summary.salary?.text ?? '')) return;
          // Keep what was typed; also keep the numbers when they can be read.
          const parsed = t ? parseSalary(t) : undefined;
          onChange({ salary: t ? { ...(parsed ?? {}), text: t } : undefined });
        }}
      />
    </label>
  );
}

function ListField({ label, items, onChange }: { label: string; items: string[]; onChange(items: string[]): void }) {
  const [text, setText] = useState(items.join('\n'));
  useEffect(() => setText(items.join('\n')), [items]);
  return (
    <label>
      {label} <span className="muted small">(one per line)</span>
      <textarea
        rows={Math.min(8, Math.max(2, items.length + 1))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split('\n').map((l) => l.trim()).filter(Boolean))}
      />
    </label>
  );
}

function StageSection({ app, onChange }: { app: Application; onChange(h: Application['history']): void }) {
  const history = sortHistory(app.history);
  const [stage, setStage] = useState<Stage>(nextStage(currentStage(app)));
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [note, setNote] = useState('');

  function add() {
    // Today keeps the current time, so two changes on one day stay in order.
    const today = toDateInput(Date.now());
    const at = date === today ? Date.now() : (fromDateInput(date) ?? Date.now()) - 12 * 3600 * 1000;
    const next = [...app.history, { stage, at, ...(note.trim() ? { note: note.trim() } : {}) }];
    onChange(next);
    setNote('');
    setStage(nextStage(stage));
  }

  return (
    <section className="card">
      <h2>Progress</h2>
      <ol className="timeline">
        {history.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <StageBadge stage={e.stage} />
            <span className="small">{fmtDate(e.at)}</span>
            {e.note && <span className="small">{e.note}</span>}
            <span className="spacer" />
            {history.length > 1 && (
              <button className="icon" title="Remove this step" onClick={() => onChange(app.history.filter((x) => x !== e))}>
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="stage-add">
        <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input value={note} placeholder="Note (optional)" onChange={(e) => setNote(e.target.value)} />
        <button onClick={add}>Add</button>
      </div>
    </section>
  );
}

function ResumeSection({ app, onChange }: { app: Application; onChange(p: Partial<Application>): void }) {
  const { links, versions, reloadVersions } = useOwnerData();
  const link = app.linkSlug ? links.find((l) => l.slug === app.linkSlug) : undefined;
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [creating, setCreating] = useState(false);
  const [versionId, setVersionId] = useState(() => (versions.find((v) => v.isMain) ?? versions[0])?.id ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    setStats(null);
    if (link) viewStats(link.slug).then(setStats, () => setStats(null));
  }, [link]);

  async function create() {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return setError('Pick a version.');
    if (!app.company.trim()) return setError('Add the company first.');
    setCreating(true);
    setError('');
    try {
      const slug = makeSlug(app.company);
      await createLink({ slug, company: app.company.trim(), ...(app.role ? { note: app.role } : {}), versionId: v.id, createdAt: Date.now(), enabled: true, expiresAt: null }, v);
      await reloadVersions();
      onChange({ linkSlug: slug, versionId: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  const sorted = [...links].sort((a, b) => b.createdAt - a.createdAt);
  const linkedVersion = link && versions.find((v) => v.id === link.versionId);

  return (
    <section className="card">
      <h2>Resume sent</h2>
      <label>
        Company link
        <select
          value={app.linkSlug ?? ''}
          onChange={(e) => onChange({ linkSlug: e.target.value || undefined, ...(e.target.value ? { versionId: undefined } : {}) })}
        >
          <option value="">None</option>
          {app.linkSlug && !link && <option value={app.linkSlug}>/{app.linkSlug} (deleted)</option>}
          {sorted.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.company} · /{l.slug}
            </option>
          ))}
        </select>
      </label>
      {link && (
        <p className="small">
          <a href={`${location.origin}/${link.slug}`} target="_blank" rel="noopener">
            {location.host}/{link.slug}
          </a>{' '}
          · shows {linkedVersion?.name ?? '(deleted version)'} ·{' '}
          {stats === null
            ? 'views …'
            : stats.views
              ? `${stats.views} view${stats.views === 1 ? '' : 's'}, last ${fmtDateTime(stats.lastAt)}`
              : 'not opened yet'}
        </p>
      )}
      {!app.linkSlug && (
        <>
          <div className="link-row">
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.isMain ? ' (main)' : ''}
                </option>
              ))}
            </select>
            <button disabled={creating} onClick={() => void create()}>
              {creating ? 'Creating…' : `+ New link for ${app.company.trim() || 'this company'}`}
            </button>
          </div>
          <label className="file-version">
            Or sent as a file
            <select value={app.versionId ?? ''} onChange={(e) => onChange({ versionId: e.target.value || undefined })}>
              <option value="">—</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
