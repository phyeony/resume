import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lead, LeadStatus } from '../../model/types';
import { urlKey } from '../../applications/model';
import { knownSources } from '../../applications/stats';
import { companyFromUrl } from '../../applications/summarize';
import { newId, saveLead } from './store';
import { useOwnerData } from './Admin';
import { fmtDate } from './format';
import './applications.css';

const STATUS_LABELS: Record<LeadStatus, string> = { new: 'New', tracked: 'Tracked', dismissed: 'Dismissed' };

/** Jobs worth a look, before deciding to apply. Track one to start an application; dismiss the rest. */
export function LeadsPage() {
  const { leads, applications } = useOwnerData();
  const [filter, setFilter] = useState<LeadStatus>('new');
  const [adding, setAdding] = useState(false);

  const shown = useMemo(
    () => leads.filter((l) => l.status === filter).sort((a, b) => (b.postedAt ?? b.addedAt) - (a.postedAt ?? a.addedAt)),
    [leads, filter],
  );
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s).length;

  return (
    <div className="pad">
      <div className="page-head">
        <h1>Leads</h1>
        <span className="spacer" />
        {!adding && (
          <button className="primary" onClick={() => setAdding(true)}>
            + Add lead
          </button>
        )}
      </div>
      <p className="muted">
        Jobs worth a look, before you decide to apply. Track one to start an application with its posting; dismiss the
        rest.
      </p>

      {adding && <AddLead onClose={() => setAdding(false)} />}

      <div className="chips stage-filter">
        {(['new', 'tracked', 'dismissed'] as LeadStatus[]).map((s) => (
          <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
            {STATUS_LABELS[s]} <span className="muted small">{count(s)}</span>
          </button>
        ))}
      </div>

      {leads.length === 0 && <p className="muted">No leads yet. Add one when you spot a job, even if you're not sure about it.</p>}
      {leads.length > 0 && shown.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="version-list">
        {shown.map((l) => (
          <LeadRow key={l.id} lead={l} application={l.applicationId ? applications.find((a) => a.id === l.applicationId) : undefined} />
        ))}
      </div>
    </div>
  );
}

function LeadRow({ lead, application }: { lead: Lead; application?: { id: string } }) {
  const { reloadLeads } = useOwnerData();
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
          </h2>
          <div className="muted small">
            {lead.postedAt ? `Posted ${fmtDate(lead.postedAt)}` : `Added ${fmtDate(lead.addedAt)}`}
            {lead.location && ` · ${lead.location}`}
            {` · via ${lead.source}`}
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
