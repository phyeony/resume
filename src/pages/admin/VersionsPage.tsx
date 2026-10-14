import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteVersion, publishLink, setLinkState, setMain, viewStats, type ViewStats } from './store';
import type { Version } from '../../model/types';
import { useOwnerData } from './Admin';
import { exportVersion } from './exporting';
import { fmtDate, fmtDateTime, fromDateInput, toDateInput } from './format';

export function VersionsPage() {
  const { versions, reloadVersions } = useOwnerData();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sorted = useMemo(
    () => [...versions].sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.updatedAt - a.updatedAt),
    [versions],
  );

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
      await reloadVersions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pad">
      <div className="page-head">
        <h1>Versions</h1>
        <span className="spacer" />
        <button className="primary" onClick={() => navigate('/admin/versions/new')}>
          + New version
        </button>
      </div>
      <p className="muted">
        Each version is a frozen copy of what you sent. Editing your experience later doesn't change it until you
        re-open and save it.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="version-list">
        {sorted.map((v) => (
          <VersionCard key={v.id} v={v} all={versions} busy={busy} act={act} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  v: Version;
  all: Version[];
  busy: string | null;
  act(key: string, fn: () => Promise<unknown>): Promise<void>;
}

function VersionCard({ v, all, busy, act }: CardProps) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lastExport = v.exports.length ? Math.max(...v.exports.map((e) => e.at)) : null;
  const is = (k: string) => busy === `${v.id}:${k}`;

  return (
    <article className={`card version ${v.isMain ? 'main' : ''}`}>
      <div className="version-head">
        <div>
          <h2>
            <Link to={`/admin/versions/${v.id}`}>{v.name}</Link>
            {v.isMain && <span className="badge">Main</span>}
          </h2>
          <div className="muted small">
            {[v.company, v.role].filter(Boolean).join(' · ') || 'No company'}
          </div>
        </div>
        <span className="spacer" />
        <div className="btn-row">
          <button disabled={is('pdf')} onClick={() => void act(`${v.id}:pdf`, () => exportVersion(v, 'pdf'))}>
            {is('pdf') ? '…' : 'PDF'}
          </button>
          <button disabled={is('docx')} onClick={() => void act(`${v.id}:docx`, () => exportVersion(v, 'docx'))}>
            {is('docx') ? '…' : 'DOCX'}
          </button>
          <button onClick={() => navigate(`/admin/versions/new?from=${v.id}`)}>Duplicate</button>
          {!v.isMain && (
            <button disabled={is('main')} onClick={() => void act(`${v.id}:main`, () => setMain(v, all))}>
              Set as main
            </button>
          )}
        </div>
      </div>

      <dl className="facts">
        <div>
          <dt>Created</dt>
          <dd>{fmtDate(v.createdAt)}</dd>
        </div>
        <div>
          <dt>Last saved</dt>
          <dd>{fmtDate(v.updatedAt)}</dd>
        </div>
        <div>
          <dt>Exports</dt>
          <dd>
            {v.exports.length}
            {lastExport ? ` · last ${fmtDate(lastExport)}` : ''}
          </dd>
        </div>
      </dl>
      {v.notes && <p className="small notes">{v.notes}</p>}

      <LinkPanel v={v} busy={busy} act={act} />

      {!v.isMain && (
        <div className="danger-row">
          {confirmDelete ? (
            <>
              <span className="small">Delete “{v.name}”{v.slug ? ' and turn off its link' : ''}?</span>
              <button className="danger" onClick={() => void act(`${v.id}:del`, () => deleteVersion(v))}>
                Delete
              </button>
              <button className="link" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="link danger-text" onClick={() => setConfirmDelete(true)}>
              Delete version
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function LinkPanel({ v, busy, act }: Omit<CardProps, 'all'>) {
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [copied, setCopied] = useState(false);
  const url = v.slug ? `${location.origin}/${v.slug}` : '';
  const expired = !!v.expiresAt && v.expiresAt < Date.now();

  useEffect(() => {
    if (v.slug) viewStats(v.slug).then(setStats, () => setStats(null));
  }, [v.slug]);

  if (!v.slug) {
    return (
      <div className="link-panel">
        <button
          disabled={busy === `${v.id}:publish`}
          onClick={() => void act(`${v.id}:publish`, () => publishLink(v))}
        >
          Create company link
        </button>
        <span className="muted small">A private page like /{v.company ? v.company.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'company'}-x7k2 with view tracking</span>
      </div>
    );
  }

  return (
    <div className="link-panel on">
      <div className="link-row">
        <a href={url} target="_blank" rel="noopener" className={v.linkEnabled && !expired ? '' : 'strike'}>
          {url.replace(/^https?:\/\//, '')}
        </a>
        <button
          className="small-btn"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!v.linkEnabled}
            onChange={(e) => void act(`${v.id}:link`, () => setLinkState(v, e.target.checked, v.expiresAt ?? null))}
          />
          {v.linkEnabled ? 'On' : 'Off'}
        </label>
        <label className="small">
          Expires{' '}
          <input
            type="date"
            value={toDateInput(v.expiresAt)}
            onChange={(e) =>
              void act(`${v.id}:link`, () => setLinkState(v, !!v.linkEnabled, fromDateInput(e.target.value)))
            }
          />
        </label>
        {expired && <span className="badge warn">Expired</span>}
      </div>
      <div className="muted small">
        {stats
          ? stats.count
            ? `${stats.count} view${stats.count === 1 ? '' : 's'} · last ${fmtDateTime(stats.lastAt)}`
            : 'Not opened yet'
          : 'Views: …'}
      </div>
    </div>
  );
}
