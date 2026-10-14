import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MAIN_SLUG, getPublic, logView } from '../data/publicStore';
import { seedLibrary, seedMainContactIds, seedProfile } from '../data/seed';
import { isOwnerDevice } from '../firebase';
import { buildSnapshot, defaultSelection } from '../model/snapshot';
import { DEFAULT_SECTION_ORDER, type Snapshot } from '../model/types';
import { ResumeView } from '../render/ResumeView';

/** Shown on "/" until the first version is published, so the site is never blank. */
const fallbackMain = (): Snapshot =>
  buildSnapshot(seedProfile, seedLibrary, defaultSelection(seedLibrary), {}, {
    sectionOrder: DEFAULT_SECTION_ORDER,
    contactIds: seedMainContactIds,
  });

type State = { status: 'loading' } | { status: 'ok'; snapshot: Snapshot } | { status: 'gone' };

export function PublicResume({ slug: fixed }: { slug?: string }) {
  const params = useParams();
  const slug = fixed ?? params.slug ?? MAIN_SLUG;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getPublic(slug).then((doc) => {
      if (cancelled) return;
      if (doc) setState({ status: 'ok', snapshot: doc.snapshot });
      else if (slug === MAIN_SLUG) setState({ status: 'ok', snapshot: fallbackMain() });
      else setState({ status: 'gone' });
      if (doc && slug !== MAIN_SLUG && !isOwnerDevice()) void logView(slug);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === 'loading') return <div className="resume-page" />;
  if (state.status === 'gone') {
    return (
      <div className="resume-page">
        <main className="sheet gone">
          <h1>This link is no longer available.</h1>
        </main>
      </div>
    );
  }
  return (
    <div className="resume-page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <ResumeView snapshot={state.snapshot} />
    </div>
  );
}
