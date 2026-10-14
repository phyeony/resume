import { useState } from 'react';
import { saveLibrary, saveProfile, saveVersion } from './store';
import { seedLibrary, seedMainContactIds, seedProfile } from '../../data/seed';
import { buildSnapshot, defaultSelection } from '../../model/snapshot';
import { DEFAULT_SECTION_ORDER, type Version } from '../../model/types';

/** First run: copy the starter content into Firestore and publish it as the main version. */
export function Setup({ onDone }: { onDone(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const selection = defaultSelection(seedLibrary);
      const layout = { sectionOrder: [...DEFAULT_SECTION_ORDER], contactIds: seedMainContactIds };
      const now = Date.now();
      const main: Version = {
        id: 'v-main',
        name: 'General — software developer',
        createdAt: now,
        updatedAt: now,
        isMain: true,
        selection,
        overrides: {},
        layout,
        snapshot: buildSnapshot(seedProfile, seedLibrary, selection, {}, layout),
        exports: [],
      };
      await saveProfile(seedProfile);
      await saveLibrary(seedLibrary);
      await saveVersion(main);
      await onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="pad">
      <div className="card narrow">
        <h1>Welcome</h1>
        <p>
          Nothing is stored yet. Load the starter content: your current resume (work, projects, skills,
          education) plus a <strong>main</strong> version that the public site shows.
        </p>
        <p className="muted">
          Your phone number isn't included, so it never ships in the public site code. Add it under Profile
          afterwards; it stays private unless you tick it on a version.
        </p>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Loading…' : 'Load starter content'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
