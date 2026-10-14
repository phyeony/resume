import { linkLabel } from '../model/snapshot';
import type { Snapshot, SnapshotEntry } from '../model/types';
import { ContactIcon } from './ContactIcon';
import { Rich } from './Rich';
import './resume.css';

/** The resume as a web page. Markup mirrors the original static index.html. */
export function ResumeView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <main id="main" className="sheet">
      <header className="masthead">
        <h1>{snapshot.name}</h1>
        <ul className="contact">
          {snapshot.contacts.map((c) => (
            <li key={c.id} className={c.href ? undefined : 'plain'}>
              {c.href ? (
                <a href={c.href} {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>
                  <ContactIcon kind={c.kind} />
                  <span>{c.label}</span>
                </a>
              ) : (
                <>
                  <ContactIcon kind={c.kind} />
                  <span>{c.label}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </header>

      {snapshot.sections.map((section) => (
        <section key={section.key} className="section">
          <h2>{section.title}</h2>
          {section.skills && (
            <ul className="bullets">
              {section.skills.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}:</strong> {s.items}
                </li>
              ))}
            </ul>
          )}
          {section.entries?.map((e, i) => <EntryView key={i} entry={e} />)}
        </section>
      ))}
    </main>
  );
}

function EntryView({ entry: e }: { entry: SnapshotEntry }) {
  return (
    <article className="entry">
      <div className="entry-head">
        <span className="role">
          {e.title}
          {e.stack && (
            <>
              {' '}
              <span className="sep">|</span> <em className="stack">{e.stack}</em>
            </>
          )}
          {e.url && (
            <>
              {' '}
              <span className="sep">|</span>{' '}
              <a className="entry-link" href={e.url} target="_blank" rel="noopener">
                {linkLabel(e.url)}
              </a>
            </>
          )}
        </span>
        <span className="dates">{e.dates}</span>
      </div>
      {e.org &&
        (e.orgRight ? (
          <div className="entry-head sub">
            <span className="org">{e.org}</span>
            <span className="gpa">{e.orgRight}</span>
          </div>
        ) : (
          <div className="org">{e.org}</div>
        ))}
      {e.bullets.length > 0 && (
        <ul className="bullets">
          {e.bullets.map((b, i) => (
            <li key={i}>
              <Rich text={b} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
