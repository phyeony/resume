import {
  DEFAULT_SECTION_ORDER,
  SECTION_TITLES,
  type Layout,
  type Library,
  type Profile,
  type Selection,
  type Snapshot,
  type SnapshotSection,
} from './types';

/** Everything flagged isDefault: the starting point for a new version. */
export function defaultSelection(library: Library): Selection {
  const live = library.entries.filter((e) => !e.archived);
  return {
    entryIds: live.filter((e) => e.isDefault).map((e) => e.id),
    bulletIds: live.flatMap((e) => e.bullets.filter((b) => b.isDefault).map((b) => b.id)),
    skillItemIds: library.skills.flatMap((c) => c.items.filter((i) => i.isDefault).map((i) => i.id)),
  };
}

export function defaultLayout(profile: Profile): Layout {
  return {
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    contactIds: profile.contacts.filter((c) => c.isDefault).map((c) => c.id),
  };
}

/** Resolve a selection against the library into the frozen content that gets rendered. */
export function buildSnapshot(
  profile: Profile,
  library: Library,
  selection: Selection,
  overrides: Record<string, string>,
  layout: Layout,
): Snapshot {
  const entryOn = new Set(selection.entryIds);
  const bulletOn = new Set(selection.bulletIds);
  const skillOn = new Set(selection.skillItemIds);

  const contactsById = new Map(profile.contacts.map((c) => [c.id, c]));
  const contacts = layout.contactIds.flatMap((id) => {
    const c = contactsById.get(id);
    return c ? [c] : [];
  });

  const sections: SnapshotSection[] = [];
  for (const key of layout.sectionOrder) {
    if (key === 'skills') {
      const skills = library.skills
        .map((cat) => ({
          name: cat.name,
          items: cat.items.filter((i) => skillOn.has(i.id)).map((i) => i.text).join(', '),
        }))
        .filter((s) => s.items);
      if (skills.length) sections.push({ key, title: SECTION_TITLES[key], skills });
      continue;
    }
    const entries = library.entries
      .filter((e) => e.section === key && !e.archived && entryOn.has(e.id))
      .map((e) => ({
        title: e.title,
        ...(e.stack ? { stack: e.stack } : {}),
        ...(e.org ? { org: e.org } : {}),
        ...(e.orgRight ? { orgRight: e.orgRight } : {}),
        dates: e.dates,
        bullets: e.bullets.filter((b) => bulletOn.has(b.id)).map((b) => overrides[b.id] ?? b.text),
      }));
    if (entries.length) sections.push({ key, title: SECTION_TITLES[key], entries });
  }

  return { name: profile.name, contacts, sections };
}
