import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId, saveVersion, setMain, updateLink } from './store';
import { buildSnapshot, defaultLayout, defaultSelection } from '../../model/snapshot';
import {
  SECTION_TITLES,
  type Entry,
  type EntrySection,
  type Layout,
  type Selection,
  type ShareLink,
  type Version,
} from '../../model/types';
import { ResumeView } from '../../render/ResumeView';
import { useOwnerData } from './Admin';
import { exportVersion } from './exporting';
import { fmtDate } from './format';
import { moveItem, useDragSort } from './useDragSort';

/** A place a saved version shows up. */
type Use = { kind: 'main' } | { kind: 'link'; link: ShareLink };

const useLabel = (u: Use) => (u.kind === 'main' ? 'main site' : u.link.company);
const useKey = (u: Use) => (u.kind === 'main' ? 'main' : u.link.slug);

/** What to do with edits to a version that several places show. */
type SaveChoiceResult =
  | { mode: 'all' }
  | { mode: 'only'; use: Use; name: string }
  | { mode: 'new'; name: string };

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
  const { profile, library, versions, links, reloadVersions } = useOwnerData();

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
  const uses: Use[] = existing
    ? [
        ...(existing.isMain ? [{ kind: 'main' } as const] : []),
        ...links.filter((l) => l.versionId === existing.id).map((link) => ({ kind: 'link', link }) as const),
      ]
    : [];
  // Shared versions ask where an edit should go, so one company's tweak can't leak into the others.
  const shared = uses.length > 1;
  const openedFor = search.get('for');
  const openedUse = uses.find((u) => useKey(u) === openedFor);
  const [choosing, setChoosing] = useState<{ then?: (v: Version) => Promise<void> } | null>(null);

  if (id !== 'new' && !existing) {
    return <p className="pad error">Version not found.</p>;
  }

  function update(fn: (d: Draft) => Draft) {
    setDraft((d) => fn(structuredClone(d)));
    setDirty(true);
  }

  function draftFields(now: number) {
    return {
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
  }

  async function guarded<T>(fn: () => Promise<T>): Promise<T | null> {
    setSaving(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  /** Writes the edits into this version, updating every place that shows it. */
  async function saveInPlace(): Promise<Version | null> {
    return guarded(async () => {
      const now = Date.now();
      const v: Version = {
        ...(existing ?? { id: newId('v-'), createdAt: now, isMain: false, exports: [] }),
        ...draftFields(now),
      };
      await saveVersion(v);
      await reloadVersions();
      setDirty(false);
      if (!existing) navigate(`/admin/versions/${v.id}`, { replace: true });
      return v;
    });
  }

  /** Saves the edits as a new version, optionally moving one place onto it; the original stays as it was. */
  async function saveAsNew(name: string, use: Use | null, then?: (v: Version) => Promise<void>) {
    await guarded(async () => {
      const now = Date.now();
      const v: Version = {
        ...draftFields(now),
        id: newId('v-'),
        createdAt: now,
        isMain: false,
        exports: [],
        name: name.trim() || `${draft.name.trim()} (copy)`,
        ...(use?.kind === 'link' ? { company: use.link.company } : {}),
      };
      await saveVersion(v);
      if (use?.kind === 'link') await updateLink({ ...use.link, versionId: v.id }, v);
      if (use?.kind === 'main') await setMain(v, versions);
      if (then) await then(v);
      await reloadVersions();
      setDirty(false);
      navigate(`/admin/versions/${v.id}`);
    });
  }

  /** Save button: asks first when the version is shared. `then` runs on whichever version ends up saved. */
  async function requestSave(then?: (v: Version) => Promise<void>) {
    if (!draft.name.trim()) {
      setError('Give the version a name, e.g. “Amazon — SDE II”.');
      return;
    }
    if (shared) {
      setChoosing({ then });
      return;
    }
    const v = await saveInPlace();
    if (v && then) await then(v);
  }

  async function resolveChoice(choice: SaveChoiceResult) {
    const then = choosing?.then;
    setChoosing(null);
    if (choice.mode === 'all') {
      const v = await saveInPlace();
      if (v && then) await then(v);
    } else {
      await saveAsNew(choice.name, choice.mode === 'only' ? choice.use : null, then);
    }
  }

  async function exportAs(format: 'pdf' | 'docx') {
    const after = async (v: Version) => {
      await exportVersion(v, format);
      await reloadVersions();
    };
    if (dirty || drifted || !existing) await requestSave(after);
    else await after(existing);
  }

  return (
    <div className="builder">
      <aside className="builder-side">
        <div className="builder-actions">
          <button className="link" onClick={() => navigate('/admin/versions')}>
            ← Versions
          </button>
          <span className="spacer" />
          <button className="primary" disabled={saving || (!dirty && !drifted)} onClick={() => void requestSave()}>
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

        {uses.length === 1 && <p className="muted small">Live on {useLabel(uses[0])}. Saving updates it too.</p>}
        {shared && (
          <p className="muted small">
            Live on {uses.map(useLabel).join(', ')}. When you save, you'll choose whether the change goes everywhere or
            only to {openedUse ? useLabel(openedUse) : 'one of them'}.
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
      {choosing && (
        <SaveChoice
          uses={uses}
          baseName={draft.name.trim()}
          preferred={openedFor}
          onCancel={() => setChoosing(null)}
          onConfirm={(c) => void resolveChoice(c)}
        />
      )}
    </div>
  );
}

function SaveChoice({
  uses,
  baseName,
  preferred,
  onCancel,
  onConfirm,
}: {
  uses: Use[];
  baseName: string;
  preferred: string | null;
  onCancel(): void;
  onConfirm(c: SaveChoiceResult): void;
}) {
  // 'all' | 'new' | a use key
  const [pick, setPick] = useState(() => (uses.some((u) => useKey(u) === preferred) ? preferred! : 'all'));
  const suggested = (p: string) => {
    const use = uses.find((u) => useKey(u) === p);
    return use ? `${baseName} — ${use.kind === 'main' ? 'main' : use.link.company}` : `${baseName} (copy)`;
  };
  const [name, setName] = useState(() => suggested(pick));

  function choose(p: string) {
    setPick(p);
    setName(suggested(p));
  }

  function confirm() {
    if (pick === 'all') return onConfirm({ mode: 'all' });
    if (pick === 'new') return onConfirm({ mode: 'new', name });
    onConfirm({ mode: 'only', use: uses.find((u) => useKey(u) === pick)!, name });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="save-choice-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="save-choice-title">Where should this change go?</h2>
        <p className="muted small">This version is live on {uses.map(useLabel).join(', ')}.</p>

        <label className="check choice">
          <input type="radio" name="save-choice" checked={pick === 'all'} onChange={() => choose('all')} />
          <span>
            <strong>Update everywhere</strong>
            <span className="muted small"> For fixes that belong on all of them, like a typo or new dates.</span>
          </span>
        </label>
        {uses.map((u) => (
          <label key={useKey(u)} className="check choice">
            <input type="radio" name="save-choice" checked={pick === useKey(u)} onChange={() => choose(useKey(u))} />
            <span>
              <strong>Only for {useLabel(u)}</strong>
              <span className="muted small">
                {' '}
                Saves a new version and moves {u.kind === 'main' ? 'your main site' : `the ${u.link.company} link`} to it.
                The others keep the current version.
              </span>
            </span>
          </label>
        ))}
        <label className="check choice">
          <input type="radio" name="save-choice" checked={pick === 'new'} onChange={() => choose('new')} />
          <span>
            <strong>Save as a new version</strong>
            <span className="muted small"> Nothing moves to it; every link keeps the current version.</span>
          </span>
        </label>

        {pick !== 'all' && (
          <label>
            New version name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        <div className="btn-row">
          <button className="primary" onClick={confirm}>
            Save
          </button>
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
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
  const sort = useDragSort(
    (from, to) =>
      update((d) => {
        moveItem(d.layout.sectionOrder, from, to);
        return d;
      }),
    order.length,
  );

  return (
    <fieldset>
      <legend>Layout</legend>
      <div className="sub-label">Section order</div>
      <ol className="order-list">
        {order.map((key, i) => (
          <li key={key} {...sort.row(i)}>
            <span {...sort.handle(i)}>⋮⋮</span>
            <span>{SECTION_TITLES[key]}</span>
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
