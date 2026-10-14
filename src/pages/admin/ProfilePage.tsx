import { useState } from 'react';
import { newId, saveProfile } from './store';
import type { Contact, ContactKind, Profile } from '../../model/types';
import { useOwnerData } from './Admin';
import { moveItem, useDragSort } from './useDragSort';

const KINDS: ContactKind[] = ['linkedin', 'email', 'phone', 'github', 'location', 'url'];

const HREF_HINT: Record<ContactKind, string> = {
  linkedin: 'https://www.linkedin.com/in/…',
  email: 'mailto:you@example.com',
  phone: 'tel:+16045551234 (optional)',
  github: 'https://github.com/…',
  location: '(usually none)',
  url: 'https://…',
};

export function ProfilePage() {
  const { profile, setProfile } = useOwnerData();
  const [draft, setDraft] = useState<Profile>(() => structuredClone(profile));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(fn: (p: Profile) => void) {
    setDraft((p) => {
      const next = structuredClone(p);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  const editContact = (i: number, fn: (c: Contact) => void) => update((p) => fn(p.contacts[i]));
  const sort = useDragSort((from, to) => update((p) => moveItem(p.contacts, from, to)), draft.contacts.length);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await saveProfile(draft);
      setProfile(draft);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pad">
      <div className="page-head">
        <h1>Profile</h1>
        <span className="spacer" />
        <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <label>
          Name
          <input value={draft.name} onChange={(e) => update((p) => void (p.name = e.target.value))} />
        </label>
      </div>

      <h2>Contact line</h2>
      <p className="muted small">
        Each version picks which of these to show. ★ = pre-checked for new versions. Order here is the order on the
        resume.
      </p>
      <div className="card">
        <table className="contacts-table">
          <thead>
            <tr>
              <th />
              <th>★</th>
              <th>Type</th>
              <th>Shown as</th>
              <th>Link</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.contacts.map((c, i) => (
              <tr key={c.id} {...sort.row(i)}>
                <td>
                  <span {...sort.handle(i)}>⋮⋮</span>
                </td>
                <td>
                  <button
                    className={`icon star-btn ${c.isDefault ? 'on' : ''}`}
                    onClick={() => editContact(i, (x) => void (x.isDefault = !x.isDefault))}
                  >
                    ★
                  </button>
                </td>
                <td>
                  <select value={c.kind} onChange={(e) => editContact(i, (x) => void (x.kind = e.target.value as ContactKind))}>
                    {KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={c.label} onChange={(e) => editContact(i, (x) => void (x.label = e.target.value))} />
                </td>
                <td>
                  <input
                    value={c.href ?? ''}
                    placeholder={HREF_HINT[c.kind]}
                    onChange={(e) => editContact(i, (x) => void (x.href = e.target.value || undefined))}
                  />
                </td>
                <td className="nowrap">
                  <button
                    className="icon danger-text"
                    onClick={() => update((p) => void p.contacts.splice(i, 1))}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="small-btn"
          onClick={() =>
            update((p) => void p.contacts.push({ id: newId('c-'), kind: 'phone', label: '', isDefault: false }))
          }
        >
          + Add contact
        </button>
      </div>
    </div>
  );
}
