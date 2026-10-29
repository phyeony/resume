import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { markOwnerDevice } from '../../firebase';
import { signIn, signOutUser, watchUser } from './auth';
import { isOwner, signInErrorMessage, type SessionUser } from './owner';
import { listApplications, listLeads, listLinks, listVersions, loadLibrary, loadProfile, migrateLegacyLinks } from './store';
import type { Application, Lead, Library, Profile, ShareLink, Version } from '../../model/types';
import { ApplicationEditor } from './ApplicationEditor';
import { ApplicationsPage } from './ApplicationsPage';
import { ApplicationStats } from './ApplicationStats';
import { InterviewPage } from './InterviewPage';
import { LeadsPage } from './LeadsPage';
import { OpeningsPage } from './OpeningsPage';
import { currentStage, isClosed, waitingDays } from '../../applications/model';
import { LinksPage } from './LinksPage';
import { LibraryPage } from './LibraryPage';
import { ProfilePage } from './ProfilePage';
import { Setup } from './Setup';
import { StudyPage } from './StudyPage';
import { VersionBuilder } from './VersionBuilder';
import { VersionsPage } from './VersionsPage';
import './admin.css';

interface OwnerData {
  profile: Profile;
  library: Library;
  versions: Version[];
  links: ShareLink[];
  applications: Application[];
  leads: Lead[];
  setProfile(p: Profile): void;
  setLibrary(l: Library): void;
  /** Reloads versions and links together, since links show versions. */
  reloadVersions(): Promise<void>;
  reloadApplications(): Promise<void>;
  reloadLeads(): Promise<void>;
}

/** `npm run local`: data lives in this browser instead of Firebase. */
const LOCAL = import.meta.env.MODE === 'preview-local';

const Ctx = createContext<OwnerData | null>(null);

export function useOwnerData(): OwnerData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOwnerData outside <Admin>');
  return v;
}

export default function Admin() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => {
    document.title = 'Resume Studio';
  }, []);

  if (user === undefined) return <div className="admin" />;
  if (!user) {
    return (
      <div className="admin center">
        <div className="card narrow">
          <h1>Resume Studio</h1>
          <p className="muted">Sign in to edit your resume.</p>
          <button
            className="primary"
            disabled={signingIn}
            onClick={() => {
              setSigningIn(true);
              setSignInError(null);
              signIn()
                .catch((e: unknown) => setSignInError(signInErrorMessage(e)))
                .finally(() => setSigningIn(false));
            }}
          >
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
          {signInError && <p className="error small">{signInError}</p>}
        </div>
      </div>
    );
  }
  if (!isOwner(user)) {
    return (
      <div className="admin center">
        <div className="card narrow">
          <h1>Not authorized</h1>
          <p className="muted">{user.email ?? 'This account'} can't edit this resume. Sign in with the owner's Google account.</p>
          <button onClick={() => void signOutUser()}>Sign out</button>
        </div>
      </div>
    );
  }
  // In the local preview, keep counting your own visits so you can try view tracking.
  if (!LOCAL) markOwnerDevice();
  return <OwnerArea user={user} />;
}

function OwnerArea({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState('');

  const reloadVersions = useCallback(async () => {
    const [v, k] = await Promise.all([listVersions(), listLinks()]);
    setVersions(v);
    setLinks(k);
  }, []);

  const reloadApplications = useCallback(async () => setApplications(await listApplications()), []);
  const reloadLeads = useCallback(async () => setLeads(await listLeads()), []);

  const load = useCallback(async () => {
    try {
      const [p, l, v0] = await Promise.all([loadProfile(), loadLibrary(), listVersions()]);
      const v = (await migrateLegacyLinks(v0)) ? await listVersions() : v0;
      setProfile(p);
      setLibrary(l);
      setVersions(v);
      const [k, a, d] = await Promise.all([listLinks(), listApplications(), listLeads()]);
      setLinks(k);
      setApplications(a);
      setLeads(d);
      setStatus(p && l ? 'ready' : 'empty');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin">
      <header className="topbar">
        <span className="brand">Resume Studio</span>
        {status === 'ready' && (
          <nav>
            <NavLink to="/admin/versions">Versions</NavLink>
            <NavLink to="/admin/links">Links</NavLink>
            <NavLink to="/admin/leads">
              Leads
              <NavCount n={leads.filter((l) => l.status === 'new').length} title="new" />
            </NavLink>
            <NavLink to="/admin/openings">Openings</NavLink>
            <NavLink to="/admin/applications">
              Applications
              <NavCount
                n={applications.filter((a) => !isClosed(currentStage(a)) && waitingDays(a) !== null).length}
                title="to follow up"
                warn
              />
            </NavLink>
            <NavLink to="/admin/library">Experience &amp; skills</NavLink>
            <NavLink to="/admin/profile">Profile</NavLink>
            <NavLink to="/admin/study">Study</NavLink>
            <NavLink to="/admin/interview">Interview</NavLink>
          </nav>
        )}
        <span className="spacer" />
        {LOCAL && <span className="badge warn">Local preview · saved in this browser only</span>}
        <a href="/" target="_blank" rel="noopener" className="muted">
          View site ↗
        </a>
        {!LOCAL && (
          <button className="link" onClick={() => void signOutUser()} title={user.email ?? ''}>
            Sign out
          </button>
        )}
      </header>

      {status === 'loading' && <p className="pad muted">Loading…</p>}
      {status === 'error' && (
        <div className="pad">
          <p className="error">Couldn't load your data: {error}</p>
        </div>
      )}
      {status === 'empty' && <Setup onDone={load} />}
      {status === 'ready' && profile && library && (
        <Ctx.Provider value={{ profile, library, versions, links, applications, leads, setProfile, setLibrary, reloadVersions, reloadApplications, reloadLeads }}>
          <Routes>
            <Route index element={<Navigate to="versions" replace />} />
            <Route path="versions" element={<VersionsPage />} />
            <Route path="versions/:id" element={<KeyedBuilder />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="openings" element={<OpeningsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="applications/stats" element={<ApplicationStats />} />
            <Route path="applications/:id" element={<KeyedApplication />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="study" element={<StudyPage />} />
            <Route path="interview" element={<InterviewPage />} />
            <Route path="*" element={<Navigate to="versions" replace />} />
          </Routes>
        </Ctx.Provider>
      )}
    </div>
  );
}

/** Fresh builder state per version (and per "duplicate from"), e.g. after creating one. */
function KeyedBuilder() {
  const { pathname, search } = useLocation();
  return <VersionBuilder key={pathname + search} />;
}

function KeyedApplication() {
  const { pathname, search } = useLocation();
  return <ApplicationEditor key={pathname + search} />;
}

function NavCount({ n, title, warn }: { n: number; title: string; warn?: boolean }) {
  if (!n) return null;
  return (
    <span className={`badge tiny ${warn ? 'warn' : ''}`} title={`${n} ${title}`}>
      {n}
    </span>
  );
}
