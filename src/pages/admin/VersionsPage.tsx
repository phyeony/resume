import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteVersion, setMain } from './store';
import type { ShareLink, Version } from '../../model/types';
import { useOwnerData } from './Admin';
import { exportVersion } from './exporting';
import { fmtDate } from './format';

export function VersionsPage() {
  const { versions, links, reloadVersions } = useOwnerData();
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
          <VersionCard key={v.id} v={v} all={versions} links={links.filter((l) => l.versionId === v.id)} busy={busy} act={act} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  v: Version;
  all: Version[];
  /** Company links showing this version. */
  links: ShareLink[];
  busy: string | null;
  act(key: string, fn: () => Promise<unknown>): Promise<void>;
}

function VersionCard({ v, all, links, busy, act }: CardProps) {
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

      <div className="link-panel">
        <span className="muted small">Links:</span>
        {links.length === 0 && <span className="muted small">none</span>}
        {links.map((l) => (
          <Link key={l.slug} to="/admin/links" className={`chip-link ${l.enabled ? '' : 'strike'}`}>
            {l.company}
          </Link>
        ))}
        <button className="small-btn" onClick={() => navigate(`/admin/links?new=${v.id}`)}>
          + Company link
        </button>
      </div>

      {!v.isMain && (
        <div className="danger-row">
          {confirmDelete ? (
            <>
              <span className="small">Delete “{v.name}”?</span>
              <button className="danger" onClick={() => void act(`${v.id}:del`, () => deleteVersion(v, links))}>
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
