import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId, saveVersion } from './store';
import { buildSnapshot, defaultLayout, defaultSelection } from '../../model/snapshot';
import {
  SECTION_TITLES,
  type Entry,
  type EntrySection,
  type Layout,
  type Selection,
  type Version,
} from '../../model/types';
import { ResumeView } from '../../render/ResumeView';
import { useOwnerData } from './Admin';
import { exportVersion } from './exporting';
import { fmtDate } from './format';

interface Draft {
  name: string;
  company: string;
  role: string;
  notes: string;
  selection: Selection;
  overrides: Record<string, string>;
  layout: Layout;
}

export function VersionBuilder() {
  const { id = 'new' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { profile, library, versions, reloadVersions } = useOwnerData();

  const existing = id === 'new' ? null : versions.find((v) => v.id === id) ?? null;
  const source = existing ?? (search.get('from') ? versions.find((v) => v.id === search.get('from')) : null);

  const [draft, setDraft] = useState<Draft>(() =>
    source
      ? {
          name: existing ? source.name : `${source.name} (copy)`,
          company: existing ? source.company ?? '' : '',
          role: existing ? source.role ?? '' : '',
          notes: existing ? source.notes ?? '' : '',
          selection: structuredClone(source.selection),
          overrides: { ...source.overrides },
          layout: structuredClone(source.layout),
        }
      : {
          name: '',
          company: '',
          role: '',
          notes: '',
          selection: defaultSelection(library),
          overrides: {},
          layout: defaultLayout(profile),
        },
  );
  const [dirty, setDirty] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const snapshot = useMemo(
    () => buildSnapshot(profile, library, draft.selection, draft.overrides, draft.layout),
    [profile, library, draft],
  );
  // Opening an old version after editing the library: show that saving will pick up the edits.
  const drifted = !!existing && !dirty && stableJson(existing.snapshot) !== stableJson(snapshot);
  const pages = usePageCount(snapshot);

  if (id !== 'new' && !existing) {
    return <p className="pad error">Version not found.</p>;
  }

  function update(fn: (d: Draft) => Draft) {
    setDraft((d) => fn(structuredClone(d)));
    setDirty(true);
  }

  async function save(): Promise<Version | null> {
    if (!draft.name.trim()) {
      setError('Give the version a name, e.g. “Amazon — SDE II”.');
      return null;
    }
    setSaving(true);
    setError('');
    try {
      const now = Date.now();
      const v: Version = {
        ...(existing ?? { id: newId('v-'), createdAt: now, isMain: false, exports: [] }),
        name: draft.name.trim(),
        company: draft.company.trim(),
        role: draft.role.trim(),
        notes: draft.notes.trim(),
        selection: draft.selection,
        overrides: pruneOverrides(draft.overrides, draft.selection),
        layout: draft.layout,
        snapshot,
        updatedAt: now,
      };
      await saveVersion(v);
      await reloadVersions();
      setDirty(false);
      if (!existing) navigate(`/admin/versions/${v.id}`, { replace: true });
      return v;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function exportAs(format: 'pdf' | 'docx') {
    const v = dirty || drifted || !existing ? await save() : existing;
    if (v) {
      await exportVersion(v, format);
      await reloadVersions();
    }
  }

  return (
    <div className="builder">
      <aside className="builder-side">
        <div className="builder-actions">
          <button className="link" onClick={() => navigate('/admin/versions')}>
            ← Versions
          </button>
          <span className="spacer" />
          <button className="primary" disabled={saving || (!dirty && !drifted)} onClick={() => void save()}>
            {saving ? 'Saving…' : existing ? 'Save' : 'Create version'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {drifted && (
          <p className="notice small">
            Your experience library changed since this version was saved{existing ? ` (${fmtDate(existing.updatedAt)})` : ''}. The
            preview shows the current text; saving updates the frozen copy.
          </p>
        )}

        <fieldset>
          <legend>Details</legend>
          <label>
            Name
            <input value={draft.name} placeholder="Amazon — SDE II" onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
          </label>
          <div className="two">
            <label>
              Company
              <input value={draft.company} onChange={(e) => update((d) => ({ ...d, company: e.target.value }))} />
            </label>
            <label>
              Role
              <input value={draft.role} onChange={(e) => update((d) => ({ ...d, role: e.target.value }))} />
            </label>
          </div>
          <label>
            Notes
            <textarea rows={2} value={draft.notes} placeholder="Job link, referral, anything to remember" onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} />
          </label>
        </fieldset>

        <LayoutEditor draft={draft} update={update} />
        <SkillsPicker draft={draft} update={update} />
        {(['work', 'projects', 'education'] as EntrySection[]).map((section) => (
          <EntriesPicker key={section} section={section} draft={draft} update={update} />
        ))}
      </aside>

      <section className="builder-preview">
        <div className="preview-bar">
          <span className={pages === null ? 'muted' : pages > 1 ? 'warn-text' : 'ok-text'}>
            {pages === null ? 'Measuring…' : pages > 1 ? `${pages} pages — trim to fit one` : '1 page ✓'}
          </span>
          <span className="spacer" />
          <button onClick={() => void exportAs('pdf')}>Download PDF</button>
          <button onClick={() => void exportAs('docx')}>Download DOCX</button>
        </div>
        <div className="preview-scroll">
          <ResumeView snapshot={snapshot} />
        </div>
      </section>
    </div>
  );
}

/** JSON with sorted keys: Firestore hands maps back in its own key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Drop rewordings for bullets that aren't selected any more. */
function pruneOverrides(overrides: Record<string, string>, sel: Selection): Record<string, string> {
  const on = new Set(sel.bulletIds);
  return Object.fromEntries(Object.entries(overrides).filter(([id, text]) => on.has(id) && text.trim()));
}

/** Page count of the real PDF, re-measured shortly after edits stop. */
function usePageCount(snapshot: ReturnType<typeof buildSnapshot>): number | null {
  const [pages, setPages] = useState<number | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setPages(null);
    const t = setTimeout(async () => {
      const { buildPdf } = await import('../../render/pdf');
      const text = await (await buildPdf(snapshot)).text();
      if (n === seq.current) setPages((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length);
    }, 700);
    return () => clearTimeout(t);
  }, [snapshot]);
  return pages;
}

interface PickerProps {
  draft: Draft;
  update(fn: (d: Draft) => Draft): void;
}

function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);
}

function LayoutEditor({ draft, update }: PickerProps) {
  const { profile } = useOwnerData();
  const order = draft.layout.sectionOrder;
  const move = (i: number, dir: -1 | 1) =>
    update((d) => {
      const o = d.layout.sectionOrder;
      [o[i], o[i + dir]] = [o[i + dir], o[i]];
      return d;
    });

  return (
    <fieldset>
      <legend>Layout</legend>
      <div className="sub-label">Section order</div>
      <ol className="order-list">
        {order.map((key, i) => (
          <li key={key}>
            <span>{SECTION_TITLES[key]}</span>
            <span className="spacer" />
            <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              ↑
            </button>
            <button className="icon" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="sub-label">Contact line</div>
      {profile.contacts.map((c) => (
        <label key={c.id} className="check">
          <input
            type="checkbox"
            checked={draft.layout.contactIds.includes(c.id)}
            onChange={(e) =>
              update((d) => {
                // keep the profile's order regardless of click order
                const on = new Set(toggle(d.layout.contactIds, c.id, e.target.checked));
                d.layout.contactIds = profile.contacts.filter((x) => on.has(x.id)).map((x) => x.id);
                return d;
              })
            }
          />
          <span>
            {c.label} <span className="muted small">({c.kind})</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function SkillsPicker({ draft, update }: PickerProps) {
  const { library } = useOwnerData();
  const on = new Set(draft.selection.skillItemIds);
  return (
    <fieldset>
      <legend>Skills</legend>
      {library.skills.map((cat) => (
        <div key={cat.id} className="skill-cat">
          <div className="sub-label">{cat.name}</div>
          <div className="chips">
            {cat.items.map((item) => (
              <label key={item.id} className={`chip ${on.has(item.id) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on.has(item.id)}
                  onChange={(e) =>
                    update((d) => {
                      d.selection.skillItemIds = toggle(d.selection.skillItemIds, item.id, e.target.checked);
                      return d;
                    })
                  }
                />
                {item.text}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function EntriesPicker({ section, draft, update }: PickerProps & { section: EntrySection }) {
  const { library } = useOwnerData();
  const entries = library.entries.filter((e) => e.section === section && !e.archived);
  if (!entries.length) return null;
  return (
    <fieldset>
      <legend>{SECTION_TITLES[section]}</legend>
      {entries.map((e) => (
        <EntryPicker key={e.id} entry={e} draft={draft} update={update} />
      ))}
    </fieldset>
  );
}

function EntryPicker({ entry, draft, update }: PickerProps & { entry: Entry }) {
  const entryOn = draft.selection.entryIds.includes(entry.id);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className={`pick-entry ${entryOn ? '' : 'off'}`}>
      <label className="check entry-check">
        <input
          type="checkbox"
          checked={entryOn}
          onChange={(e) =>
            update((d) => {
              d.selection.entryIds = toggle(d.selection.entryIds, entry.id, e.target.checked);
              return d;
            })
          }
        />
        <span>
          <strong>{entry.title}</strong>
          {entry.org && <span className="muted"> · {entry.org}</span>}
          <span className="muted small"> · {entry.dates}</span>
        </span>
      </label>
      {entryOn && (
        <ul className="pick-bullets">
          {entry.bullets.map((b) => {
            const on = draft.selection.bulletIds.includes(b.id);
            const override = draft.overrides[b.id];
            return (
              <li key={b.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      update((d) => {
                        d.selection.bulletIds = toggle(d.selection.bulletIds, b.id, e.target.checked);
                        return d;
                      })
                    }
                  />
                  <span className={on ? '' : 'muted'}>
                    {override ?? b.text}
                    {b.isDefault && <span className="star" title="Default bullet"> ★</span>}
                    {override !== undefined && <span className="badge tiny">reworded</span>}
                  </span>
                </label>
                {on && editing !== b.id && (
                  <button className="link small" onClick={() => setEditing(b.id)}>
                    Reword for this version
                  </button>
                )}
                {editing === b.id && (
                  <div className="reword">
                    <textarea
                      rows={3}
                      value={override ?? b.text}
                      onChange={(e) =>
                        update((d) => {
                          d.overrides[b.id] = e.target.value;
                          return d;
                        })
                      }
                    />
                    <div className="btn-row">
                      <button className="small-btn" onClick={() => setEditing(null)}>
                        Done
                      </button>
                      {override !== undefined && (
                        <button
                          className="link small"
                          onClick={() => {
                            update((d) => {
                              delete d.overrides[b.id];
                              return d;
                            });
                            setEditing(null);
                          }}
                        >
                          Reset to library text
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
