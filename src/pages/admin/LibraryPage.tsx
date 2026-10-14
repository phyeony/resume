import { useEffect, useState } from 'react';
import { newId, saveLibrary } from './store';
import { SECTION_TITLES, type Entry, type EntrySection, type Library } from '../../model/types';
import { useOwnerData } from './Admin';

const SECTIONS: EntrySection[] = ['work', 'projects', 'education'];

/** The master list. Edits here never touch saved versions until they are re-saved. */
export function LibraryPage() {
  const { library, setLibrary } = useOwnerData();
  const [draft, setDraft] = useState<Library>(() => structuredClone(library));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useWarnOnLeave(dirty);

  function update(fn: (l: Library) => void) {
    setDraft((l) => {
      const next = structuredClone(l);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await saveLibrary(draft);
      setLibrary(draft);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pad library">
      <div className="page-head sticky">
        <h1>Experience &amp; skills</h1>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="muted">
        ★ marks what's pre-selected when you start a new version. Use <code>**double asterisks**</code> for bold.
      </p>
      {error && <p className="error">{error}</p>}

      <SkillsEditor draft={draft} update={update} />

      {SECTIONS.map((section) => (
        <section key={section} className="lib-section">
          <div className="lib-section-head">
            <h2>{SECTION_TITLES[section]}</h2>
            <button
              onClick={() =>
                update((l) => {
                  // new entries go to the top of their section (most recent first)
                  const first = l.entries.findIndex((e) => e.section === section);
                  const entry: Entry = { id: newId('e-'), section, title: '', dates: '', bullets: [], isDefault: true };
                  l.entries.splice(first === -1 ? l.entries.length : first, 0, entry);
                })
              }
            >
              + Add {section === 'work' ? 'experience' : section === 'projects' ? 'project' : 'education'}
            </button>
          </div>
          {draft.entries
            .filter((e) => e.section === section && (showArchived || !e.archived))
            .map((e) => (
              <EntryEditor key={e.id} entry={e} update={update} />
            ))}
        </section>
      ))}
    </div>
  );
}

function useWarnOnLeave(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

type Update = (fn: (l: Library) => void) => void;

/** Move an entry past its neighbour within the same section. */
function moveEntry(l: Library, id: string, dir: -1 | 1) {
  const i = l.entries.findIndex((e) => e.id === id);
  const section = l.entries[i].section;
  let j = i + dir;
  while (j >= 0 && j < l.entries.length && l.entries[j].section !== section) j += dir;
  if (j < 0 || j >= l.entries.length) return;
  [l.entries[i], l.entries[j]] = [l.entries[j], l.entries[i]];
}

function swap<T>(arr: T[], i: number, j: number) {
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function EntryEditor({ entry: e, update }: { entry: Entry; update: Update }) {
  const [open, setOpen] = useState(!e.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const edit = (fn: (x: Entry) => void) =>
    update((l) => {
      fn(l.entries.find((x) => x.id === e.id)!);
    });

  return (
    <article className={`card entry-editor ${e.archived ? 'archived' : ''}`}>
      <div className="entry-editor-head">
        <button className="icon" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? '▾' : '▸'}
        </button>
        <button
          className={`icon star-btn ${e.isDefault ? 'on' : ''}`}
          title="Pre-select in new versions"
          onClick={() => edit((x) => void (x.isDefault = !x.isDefault))}
        >
          ★
        </button>
        <div className="grow" onClick={() => setOpen(true)}>
          <strong>{e.title || 'Untitled'}</strong>
          {(e.org || e.stack) && <span className="muted"> · {e.org || e.stack}</span>}
          <span className="muted small"> · {e.dates || 'no dates'}</span>
          {e.archived && <span className="badge tiny">archived</span>}
        </div>
        <button className="icon" onClick={() => update((l) => moveEntry(l, e.id, -1))} aria-label="Move up">
          ↑
        </button>
        <button className="icon" onClick={() => update((l) => moveEntry(l, e.id, 1))} aria-label="Move down">
          ↓
        </button>
      </div>

      {open && (
        <div className="entry-editor-body">
          <div className="two">
            <label>
              {e.section === 'work' ? 'Role' : e.section === 'projects' ? 'Project name' : 'Degree'}
              <input value={e.title} onChange={(ev) => edit((x) => void (x.title = ev.target.value))} />
            </label>
            <label>
              Dates
              <input
                value={e.dates}
                placeholder="November 2024 – August 2026"
                onChange={(ev) => edit((x) => void (x.dates = ev.target.value))}
              />
            </label>
          </div>
          <div className="two">
            {e.section === 'projects' ? (
              <label>
                Tech stack <span className="muted small">(after “|”)</span>
                <input value={e.stack ?? ''} onChange={(ev) => edit((x) => void (x.stack = ev.target.value || undefined))} />
              </label>
            ) : (
              <label>
                {e.section === 'work' ? 'Company, location' : 'School, location'}
                <input value={e.org ?? ''} onChange={(ev) => edit((x) => void (x.org = ev.target.value || undefined))} />
              </label>
            )}
            {e.section === 'education' && (
              <label>
                Right side <span className="muted small">(e.g. GPA)</span>
                <input
                  value={e.orgRight ?? ''}
                  onChange={(ev) => edit((x) => void (x.orgRight = ev.target.value || undefined))}
                />
              </label>
            )}
          </div>

          <div className="sub-label">Bullets</div>
          <ul className="bullet-editor">
            {e.bullets.map((b, i) => (
              <li key={b.id}>
                <button
                  className={`icon star-btn ${b.isDefault ? 'on' : ''}`}
                  title="Pre-select in new versions"
                  onClick={() => edit((x) => void (x.bullets[i].isDefault = !x.bullets[i].isDefault))}
                >
                  ★
                </button>
                <textarea
                  rows={2}
                  value={b.text}
                  onChange={(ev) => edit((x) => void (x.bullets[i].text = ev.target.value))}
                />
                <div className="stack-btns">
                  <button className="icon" onClick={() => edit((x) => swap(x.bullets, i, i - 1))} aria-label="Move up">
                    ↑
                  </button>
                  <button className="icon" onClick={() => edit((x) => swap(x.bullets, i, i + 1))} aria-label="Move down">
                    ↓
                  </button>
                  <button
                    className="icon danger-text"
                    onClick={() => edit((x) => void x.bullets.splice(i, 1))}
                    aria-label="Remove bullet"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            className="small-btn"
            onClick={() => edit((x) => void x.bullets.push({ id: newId('b-'), text: '', isDefault: true }))}
          >
            + Add bullet
          </button>

          <div className="danger-row">
            <button className="link" onClick={() => edit((x) => void (x.archived = !x.archived))}>
              {e.archived ? 'Unarchive' : 'Archive'}
            </button>
            <span className="muted small">Archived items stay in old versions but can't be picked for new ones.</span>
            <span className="spacer" />
            {confirmDelete ? (
              <>
                <button className="danger" onClick={() => update((l) => void (l.entries = l.entries.filter((x) => x.id !== e.id)))}>
                  Delete permanently
                </button>
                <button className="link" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="link danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function SkillsEditor({ draft, update }: { draft: Library; update: Update }) {
  const [adding, setAdding] = useState<Record<string, string>>({});
  return (
    <section className="lib-section">
      <div className="lib-section-head">
        <h2>Skills</h2>
        <button onClick={() => update((l) => void l.skills.push({ id: newId('sk-'), name: 'New category', items: [] }))}>
          + Add category
        </button>
      </div>
      {draft.skills.map((cat, ci) => (
        <article key={cat.id} className="card skill-editor">
          <div className="entry-editor-head">
            <input
              className="cat-name"
              value={cat.name}
              onChange={(ev) => update((l) => void (l.skills[ci].name = ev.target.value))}
            />
            <span className="spacer" />
            <button className="icon" onClick={() => update((l) => swap(l.skills, ci, ci - 1))} aria-label="Move up">
              ↑
            </button>
            <button className="icon" onClick={() => update((l) => swap(l.skills, ci, ci + 1))} aria-label="Move down">
              ↓
            </button>
            <button
              className="icon danger-text"
              disabled={cat.items.length > 0}
              title={cat.items.length ? 'Remove its skills first' : 'Remove category'}
              onClick={() => update((l) => void l.skills.splice(ci, 1))}
            >
              ×
            </button>
          </div>
          <div className="chips">
            {cat.items.map((item, ii) => (
              <span key={item.id} className={`chip editable ${item.isDefault ? 'on' : ''}`}>
                <button
                  className="chip-star"
                  title="Pre-select in new versions"
                  onClick={() => update((l) => void (l.skills[ci].items[ii].isDefault = !item.isDefault))}
                >
                  ★
                </button>
                <input
                  value={item.text}
                  size={Math.max(4, item.text.length)}
                  onChange={(ev) => update((l) => void (l.skills[ci].items[ii].text = ev.target.value))}
                />
                <button className="chip-x" onClick={() => update((l) => void l.skills[ci].items.splice(ii, 1))} aria-label="Remove">
                  ×
                </button>
              </span>
            ))}
            <form
              className="chip-add"
              onSubmit={(ev) => {
                ev.preventDefault();
                const text = (adding[cat.id] ?? '').trim();
                if (!text) return;
                update((l) => void l.skills[ci].items.push({ id: newId('si-'), text, isDefault: true }));
                setAdding({ ...adding, [cat.id]: '' });
              }}
            >
              <input
                placeholder="+ skill"
                value={adding[cat.id] ?? ''}
                onChange={(ev) => setAdding({ ...adding, [cat.id]: ev.target.value })}
              />
            </form>
          </div>
        </article>
      ))}
    </section>
  );
}
