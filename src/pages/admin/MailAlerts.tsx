import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Application, MailUpdate } from '../../model/types';
import { currentStage, isClosed } from '../../applications/model';
import { assignMail, dismissMail, listUnseenMail, revertMail } from './store';
import { useOwnerData } from './Admin';
import { StageBadge } from './ApplicationsPage';
import { fmtDate } from './format';

/**
 * What the daily mail job changed (tools/mail): moves forward, turn-downs, and status emails it couldn't
 * match. Changes are already applied; each can be reverted or moved to another application.
 */
export function MailAlerts() {
  const { applications, reloadApplications } = useOwnerData();
  const [mail, setMail] = useState<MailUpdate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => listUnseenMail().then(setMail, (e) => setError(String(e))), []);
  useEffect(() => void reload(), [reload]);

  async function act(fn: () => Promise<void>, appsChanged = false) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await Promise.all([reload(), appsChanged ? reloadApplications() : null]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const byNewest = [...mail].sort((a, b) => b.receivedAt - a.receivedAt);
  const forward = byNewest.filter((m) => m.status === 'applied' && m.kind !== 'rejected');
  const rejected = byNewest.filter((m) => m.status === 'applied' && m.kind === 'rejected');
  const unmatched = byNewest.filter((m) => m.status === 'unmatched');
  if (!mail.length && !error) return null;

  const groups: [string, string, MailUpdate[]][] = [
    ['Moving forward', 'forward', forward],
    ['Rejected', 'rejected', rejected],
    ["Couldn't match", 'unmatched', unmatched],
  ];

  return (
    <section className="mail-alerts">
      {error && <p className="error small">{error}</p>}
      {groups
        .filter(([, , list]) => list.length)
        .map(([title, tone, list]) => (
          <div key={tone} className={`card mail-group mail-${tone}`}>
            <div className="mail-group-head">
              <h2>
                {title} <span className="muted small">{list.length} from email</span>
              </h2>
              <span className="spacer" />
              <button className="link small" disabled={busy} onClick={() => void act(() => dismissMail(list.map((m) => m.id)))}>
                Dismiss all
              </button>
            </div>
            {list.map((m) => (
              <MailRow key={m.id} mail={m} apps={applications} busy={busy} act={act} />
            ))}
          </div>
        ))}
    </section>
  );
}

function MailRow({ mail: m, apps, busy, act }: { mail: MailUpdate; apps: Application[]; busy: boolean; act(fn: () => Promise<void>, appsChanged?: boolean): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const app = m.applicationId ? apps.find((a) => a.id === m.applicationId) : undefined;
  const choices = useMemo(
    () => apps.filter((a) => a.id !== app?.id && !isClosed(currentStage(a))).sort((a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role)),
    [apps, app],
  );

  return (
    <div className="mail-row">
      <div className="mail-line">
        <div className="grow-text">
          {app ? (
            <Link to={`/admin/applications/${app.id}`}>
              {app.company} · {app.role || '(no role)'}
            </Link>
          ) : (
            <span>{m.from}</span>
          )}{' '}
          {m.fromStage && (
            <>
              <StageBadge stage={m.fromStage} /> →{' '}
            </>
          )}
          <StageBadge stage={m.toStage} />
          {m.ambiguous && <span className="warn-text small"> best guess</span>}
          <div className="muted small">
            {fmtDate(m.receivedAt)}
            {m.via === 'outlook' && ' · Outlook'} ·{' '}
            <button className="link small" onClick={() => setOpen(!open)}>
              “{m.subject}”
            </button>
          </div>
        </div>
        <div className="mail-actions">
          {(!app || m.ambiguous) && choices.length > 0 && (
            <select
              className="small"
              value=""
              disabled={busy}
              title={app ? 'Move this change to another application' : 'Apply this to an application'}
              onChange={(e) => {
                const to = apps.find((a) => a.id === e.target.value);
                if (to) void act(() => assignMail(m, to, app), true);
              }}
            >
              <option value="">{app ? 'Wrong one? Move to…' : 'Assign to…'}</option>
              {choices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company} · {a.role}
                </option>
              ))}
            </select>
          )}
          {app && (
            <button disabled={busy} title="Take this step back out of the application" onClick={() => void act(() => revertMail(m, app), true)}>
              Revert
            </button>
          )}
          <button disabled={busy} onClick={() => void act(() => dismissMail([m.id]))}>
            {app ? 'OK' : 'Dismiss'}
          </button>
        </div>
      </div>
      {open && (
        <pre className="mail-excerpt">
          From: {m.from}
          {'\n\n'}
          {m.excerpt}
        </pre>
      )}
    </div>
  );
}
