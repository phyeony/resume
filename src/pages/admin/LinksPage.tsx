import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createLink, deleteLink, makeSlug, slugProblem, updateLink, viewStats, type ViewStats } from './store';
import type { ShareLink, Version } from '../../model/types';
import { useOwnerData } from './Admin';
import { fmtDate, fmtDateTime, fromDateInput, toDateInput } from './format';
import { currentStage } from '../../applications/model';
import { STAGE_LABELS } from '../../model/types';

/** Company links: each one shows a version at /<slug>, with its own switch, expiry and views. */
export function LinksPage() {
  const { versions, links, reloadVersions } = useOwnerData();
  const [search, setSearch] = useSearchParams();
  const preselect = search.get('new');
  const [creating, setCreating] = useState(!!preselect);
  /** The link just created, copied for pasting into an application. */
  const [justCopied, setJustCopied] = useState('');

  const sorted = useMemo(() => [...links].sort((a, b) => b.createdAt - a.createdAt), [links]);
  const byId = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);

  return (
    <div className="pad">
      <div className="page-head">
        <h1>Links</h1>
        <span className="spacer" />
        {!creating && (
          <button className="primary" onClick={() => setCreating(true)}>
            + New link
          </button>
        )}
      </div>
      <p className="muted">
        One link per company you send your resume to. Several links can show the same version, and a link shows the
        version's latest save.
      </p>

      {creating && (
        <NewLinkForm
          versions={versions}
          initialVersionId={preselect}
          onDone={(slug) => {
            setCreating(false);
            if (slug) setJustCopied(slug);
            if (preselect) setSearch({}, { replace: true });
            void reloadVersions();
          }}
        />
      )}

      {sorted.length === 0 && !creating && <p className="muted">No links yet.</p>}
      <div className="version-list">
        {sorted.map((l) => (
          <LinkCard key={l.slug} link={l} copied={l.slug === justCopied} version={byId.get(l.versionId)} versions={versions} reload={reloadVersions} />
        ))}
      </div>
    </div>
  );
}

function NewLinkForm({
  versions,
  initialVersionId,
  onDone,
}: {
  versions: Version[];
  initialVersionId: string | null;
  onDone(createdSlug?: string): void;
}) {
  const fallback = versions.find((v) => v.isMain) ?? versions[0];
  const [versionId, setVersionId] = useState(
    versions.some((v) => v.id === initialVersionId) ? initialVersionId! : fallback?.id ?? '',
  );
  const [company, setCompany] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Suggest an address from the company name until it's edited by hand.
  useEffect(() => {
    if (!slugEdited) setSlug(company.trim() ? makeSlug(company) : '');
  }, [company, slugEdited]);

  const problem = slug ? slugProblem(slug) : null;

  async function create() {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return setError('Pick a version.');
    if (!company.trim()) return setError('Who is this link for?');
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await createLink(
        {
          slug,
          company: company.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
          versionId,
          createdAt: Date.now(),
          enabled: true,
          expiresAt: fromDateInput(expires),
        },
        v,
      );
      await copyText(linkUrl(slug));
      onDone(slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card new-link">
      <div className="two">
        <label>
          Company
          <input value={company} autoFocus placeholder="Amazon" onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          Version
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.isMain ? ' (main)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Address
        <div className="slug-input">
          <span className="muted">{location.host}/</span>
          <input
            value={slug}
            placeholder="amazon-x7k2"
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </div>
        {problem ? (
          <span className="error small">{problem}</span>
        ) : (
          <span className="small">The random ending keeps people from guessing other companies' links.</span>
        )}
      </label>
      <div className="two">
        <label>
          Note <span className="muted small">(only you see this)</span>
          <input value={note} placeholder="Recruiter name, job posting…" onChange={(e) => setNote(e.target.value)} />
        </label>
        <label>
          Expires <span className="muted small">(optional)</span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="btn-row">
        <button className="primary" disabled={saving} onClick={() => void create()}>
          {saving ? 'Creating…' : 'Create link'}
        </button>
        <button className="link" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export const linkUrl = (slug: string) => `${location.origin}/${slug}`;

/** Copies, and says so; the clipboard can refuse (e.g. the tab lost focus), which isn't worth an error. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** "Copy", then "Copied" for a moment. Starts as "Copied" when the text was just copied for you. */
export function CopyButton({ text, copied: initially = false }: { text: string; copied?: boolean }) {
  const [copied, setCopied] = useState(initially);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), initially ? 2500 : 1500);
    return () => clearTimeout(t);
  }, [copied, initially]);
  return (
    <button className="small-btn" title="Copy the link" onClick={() => void copyText(text).then(setCopied)}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function LinkCard({
  link,
  copied,
  version,
  versions,
  reload,
}: {
  link: ShareLink;
  copied: boolean;
  version: Version | undefined;
  versions: Version[];
  reload(): Promise<void>;
}) {
  const { applications } = useOwnerData();
  const apps = applications.filter((a) => a.linkSlug === link.slug);
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = linkUrl(link.slug);
  const expired = link.expiresAt != null && link.expiresAt < Date.now();
  const live = link.enabled && !expired;

  useEffect(() => {
    viewStats(link.slug).then(setStats, () => setStats(null));
  }, [link.slug]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function edit(patch: Partial<ShareLink>) {
    const next = { ...link, ...patch };
    const v = versions.find((x) => x.id === next.versionId);
    if (!v) return setError('That version no longer exists.');
    void run(() => updateLink(next, v));
  }

  return (
    <article className={`card link-card ${live ? '' : 'off'}`}>
      <div className="version-head">
        <div>
          <h2>
            {link.company}
            {!link.enabled && <span className="badge tiny">off</span>}
            {link.enabled && expired && <span className="badge warn tiny">expired</span>}
          </h2>
          <div className="muted small">
            Created {fmtDate(link.createdAt)}
            {link.note ? ` · ${link.note}` : ''}
          </div>
          {apps.map((a) => (
            <div key={a.id} className="small">
              Application: <Link to={`/admin/applications/${a.id}`}>{a.role || a.company}</Link>{' '}
              <span className="muted">({STAGE_LABELS[currentStage(a)]})</span>
            </div>
          ))}
        </div>
        <span className="spacer" />
        <div className="views">
          {stats === null ? (
            <span className="muted small">Views: …</span>
          ) : (
            <>
              <strong>
                {stats.views} view{stats.views === 1 ? '' : 's'}
              </strong>
              <span className="muted small">
                {stats.views
                  ? ` · ${stats.visitors} ${stats.visitors === 1 ? 'person' : 'people'} · last ${fmtDateTime(stats.lastAt)}`
                  : ' · not opened yet'}
              </span>
              {stats.bots > 0 && (
                <div className="muted small" title="Email link scanners and previews. Not counted above.">
                  + {stats.bots} automated {stats.bots === 1 ? 'check' : 'checks'} (link scanners)
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="link-row">
        <a href={url} target="_blank" rel="noopener" className={live ? '' : 'strike'}>
          {url.replace(/^https?:\/\//, '')}
        </a>
        <CopyButton text={url} copied={copied} />
      </div>

      <div className="link-row controls">
        <label className="small">
          Shows{' '}
          <select value={link.versionId} disabled={busy} onChange={(e) => edit({ versionId: e.target.value })}>
            {!version && <option value={link.versionId}>(deleted version)</option>}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {version && (
          <Link className="small" to={`/admin/versions/${version.id}?for=${link.slug}`}>
            Edit for {link.company}
          </Link>
        )}
        <label className="toggle small">
          <input type="checkbox" checked={link.enabled} disabled={busy} onChange={(e) => edit({ enabled: e.target.checked })} />
          {link.enabled ? 'On' : 'Off'}
        </label>
        <label className="small">
          Expires{' '}
          <input
            type="date"
            value={toDateInput(link.expiresAt)}
            disabled={busy}
            onChange={(e) => edit({ expiresAt: fromDateInput(e.target.value) })}
          />
        </label>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="small">
              Delete this link{stats?.views ? ` and its ${stats.views} views` : ''}? Anyone who has it will see "no longer
              available".
            </span>
            <button className="danger" disabled={busy} onClick={() => void run(() => deleteLink(link.slug))}>
              Delete
            </button>
            <button className="link" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="link danger-text" onClick={() => setConfirmDelete(true)}>
            Delete link
          </button>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
    </article>
  );
}
