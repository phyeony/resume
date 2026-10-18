import { useEffect, useRef, useState } from 'react';
import { kitProblems, makeKit, toBase64, transcriptFileName, transcriptProblem, withAnswerDefaults } from '../../applications/applyKit';
import { jobsWithChecks } from '../../applications/experience';
import type { ApplicationAnswers, KitJob, StoredPdf } from '../../model/types';
import { useOwnerData } from './Admin';
import { download } from './exporting';
import { deleteTranscript, loadAnswers, loadTranscript, newId, saveAnswers, saveTranscript } from './store';

const monthYear = (m?: number, y?: number) => (y ? (m ? `${m}/${y}` : String(y)) : '?');

function jobDates(j: KitJob): string {
  return `${monthYear(j.startMonth, j.startYear)} – ${j.current ? 'present' : monthYear(j.endMonth, j.endYear)}`;
}

type TextKey = { [K in keyof ApplicationAnswers]-?: ApplicationAnswers[K] extends string ? K : never }[keyof ApplicationAnswers];

const GROUPS: { title: string; hint?: string; fields: [TextKey, string, string?][] }[] = [
  {
    title: 'You',
    fields: [
      ['firstName', 'Legal first name'],
      ['lastName', 'Legal last name'],
      ['preferredName', 'Preferred name', 'Leave empty if the same'],
      ['pronouns', 'Pronouns'],
      ['email', 'Email'],
      ['phone', 'Phone', 'With country code, e.g. +1 604…'],
    ],
  },
  {
    title: 'Address',
    fields: [
      ['address', 'Street address'],
      ['city', 'City'],
      ['region', 'Province / state'],
      ['country', 'Country'],
      ['postalCode', 'Postal code'],
    ],
  },
  {
    title: 'Links',
    fields: [
      ['linkedin', 'LinkedIn', 'https://www.linkedin.com/in/…'],
      ['github', 'GitHub', 'https://github.com/…'],
      ['website', 'Website / portfolio'],
    ],
  },
  {
    title: 'School and availability',
    fields: [
      ['school', 'School'],
      ['degree', 'Degree', "e.g. Bachelor's"],
      ['major', 'Major / discipline'],
      ['graduation', 'Graduation', 'e.g. May 2027'],
      ['startDate', 'Earliest start', 'e.g. May 2027, or Immediately'],
      ['salary', 'Salary expectation', 'e.g. Open / negotiable'],
    ],
  },
  {
    title: 'Voluntary self-identification',
    hint: 'Used for the optional demographic questions. Write the answer as the form would list it.',
    fields: [
      ['gender', 'Gender'],
      ['race', 'Race / ethnicity'],
      ['hispanic', 'Hispanic or Latino?'],
      ['veteran', 'Veteran status'],
      ['disability', 'Disability status'],
    ],
  },
];

/** The answer bank on the Profile page, and the apply kit download. */
export function AnswersSection() {
  const { profile, versions } = useOwnerData();
  const [draft, setDraft] = useState<ApplicationAnswers | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [kitVersion, setKitVersion] = useState('');
  const [building, setBuilding] = useState(false);
  // undefined while loading, null when there is none
  const [transcript, setTranscript] = useState<StoredPdf | null | undefined>(undefined);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const transcriptInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTranscript().then(setTranscript, (e) => setError(`Couldn't load your transcript: ${String(e)}`));
  }, []);

  useEffect(() => {
    loadAnswers().then(
      (a) => {
        const next = withAnswerDefaults(a, profile);
        setDraft(next);
        // Nothing stored yet: what came from the profile still needs a save.
        setDirty(!a);
        setKitVersion(next.kitVersionId ?? versions.find((v) => v.isMain)?.id ?? '');
      },
      (e) => setError(`Couldn't load your answers: ${String(e)}`),
    );
    // Loads once; profile edits after that don't overwrite answers.
  }, []);

  if (!draft) return error ? <p className="error">{error}</p> : <p className="muted small">Loading answers…</p>;

  function update(fn: (a: ApplicationAnswers) => void) {
    setDraft((a) => {
      const next = structuredClone(a!);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  async function save(a = draft!) {
    setSaving(true);
    setError('');
    try {
      await saveAnswers(a);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function downloadKit() {
    const v = versions.find((x) => x.id === kitVersion);
    if (!v) return setError('Pick the resume version to send.');
    const problems = kitProblems(draft!);
    if (problems.length) return setError(problems.join(' '));
    setBuilding(true);
    setError('');
    try {
      const { buildPdf } = await import('../../render/pdf');
      const pdf = new Uint8Array(await (await buildPdf(v.snapshot)).arrayBuffer());
      const kit = makeKit(draft!, v, pdf, Date.now(), transcript);
      download(new Blob([JSON.stringify(kit)], { type: 'application/json' }), 'apply-kit.json');
      // Remember the version, so "Applied" on a lead records what was sent.
      setDraft(kit.answers);
      await save(kit.answers);
    } catch (e) {
      setError(String(e));
    } finally {
      setBuilding(false);
    }
  }

  async function uploadTranscript(f: File | undefined) {
    if (!f) return;
    setError('');
    const bytes = new Uint8Array(await f.arrayBuffer());
    const problem = transcriptProblem(bytes, f.name);
    if (problem) return setError(problem);
    setTranscriptBusy(true);
    try {
      const t: StoredPdf = { fileName: transcriptFileName(draft!), pdfBase64: toBase64(bytes), uploadedAt: Date.now() };
      await saveTranscript(t);
      setTranscript(t);
    } catch (e) {
      setError(`Couldn't save the transcript: ${String(e)}`);
    } finally {
      setTranscriptBusy(false);
    }
  }

  function downloadTranscript() {
    const bytes = Uint8Array.from(atob(transcript!.pdfBase64), (c) => c.charCodeAt(0));
    download(new Blob([bytes], { type: 'application/pdf' }), transcript!.fileName);
  }

  async function removeTranscript() {
    setTranscriptBusy(true);
    setError('');
    try {
      await deleteTranscript();
      setTranscript(null);
    } catch (e) {
      setError(`Couldn't remove the transcript: ${String(e)}`);
    } finally {
      setTranscriptBusy(false);
    }
  }

  const transcriptKb = transcript ? Math.round((transcript.pdfBase64.length * 3) / 4 / 1024) : 0;

  const kitJobs = jobsWithChecks(versions.find((x) => x.id === kitVersion)?.snapshot ?? { name: '', contacts: [], sections: [] });

  const otherVersions = [...versions].sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.updatedAt - a.updatedAt);

  return (
    <>
      <div className="page-head answers-head">
        <h2>Application answers</h2>
        <span className="spacer" />
        <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save answers'}
        </button>
      </div>
      <p className="muted small">
        What application forms ask every time. The autofill tools fill forms from these; they stay in your account and
        go into the apply kit you download, never into the site's code.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="card kit-card">
        <div className="kit-row">
          <label>
            Resume to send
            <select value={kitVersion} onChange={(e) => setKitVersion(e.target.value)}>
              <option value="">Choose a version…</option>
              {otherVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.isMain ? ' (main)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button disabled={building || !kitVersion} onClick={() => void downloadKit()}>
            {building ? 'Building…' : 'Download apply kit'}
          </button>
        </div>
        <div className="kit-row transcript-row">
          <span>
            Transcript{' '}
            <span className="muted small">
              {transcript === undefined
                ? 'loading…'
                : transcript
                  ? `${transcript.fileName} (${transcriptKb} KB) · uploaded ${new Date(transcript.uploadedAt).toLocaleDateString()}`
                  : 'none yet · PDF, up to 700 KB'}
            </span>
          </span>
          <input
            ref={transcriptInput}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              void uploadTranscript(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {transcript ? (
            <>
              <button className="small-btn" onClick={downloadTranscript}>
                Download
              </button>
              <button className="small-btn" disabled={transcriptBusy} onClick={() => transcriptInput.current?.click()}>
                Replace…
              </button>
              <button className="small-btn danger-text" disabled={transcriptBusy} onClick={() => void removeTranscript()}>
                Remove
              </button>
            </>
          ) : (
            <button className="small-btn" disabled={transcriptBusy || transcript === undefined} onClick={() => transcriptInput.current?.click()}>
              {transcriptBusy ? 'Uploading…' : 'Upload PDF'}
            </button>
          )}
        </div>
        {kitJobs.length > 0 && (
          <div className="kit-jobs">
            <span className="muted small">Work experience the autofill types into forms that ask for each job (Workday):</span>
            <ul className="small">
              {kitJobs.map((j, i) => (
                <li key={i}>
                  {j.title} · {j.company}
                  {j.location ? ` · ${j.location}` : ''} · {jobDates(j)}
                  {!j.datesOk && <span className="error"> dates not understood, left for you to fill</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="muted small">
          Saves <code>apply-kit.json</code> to Downloads: these answers plus the resume as a PDF, and the transcript if you
          uploaded one (sent as <code>{transcriptFileName(draft)}</code>). The autofill script reads
          it from there; the extension imports it. Download again after changing answers. Holds personal details, so
          don't commit or share it.
        </p>
      </div>

      {GROUPS.map((g) => (
        <div className="card" key={g.title}>
          <h3>{g.title}</h3>
          {g.hint && <p className="muted small">{g.hint}</p>}
          <div className="answers-grid">
            {g.fields.map(([key, label, placeholder]) => (
              <label key={key}>
                {label}
                <input value={draft[key]} placeholder={placeholder} onChange={(e) => update((a) => void (a[key] = e.target.value))} />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <h3>Work authorization</h3>
        <p className="muted small">
          Forms ask per country: "Are you authorized to work in the United States?", "Will you need sponsorship?". The
          row for the country the question names is used; "Any other country" covers the rest. Write the answer as
          you'd pick it (Yes / No).
        </p>
        <table className="contacts-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Authorized to work?</th>
              <th>Need sponsorship?</th>
              <th>Note (not filled in)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.workAuth.map((w, i) => (
              <tr key={w.id}>
                <td>
                  {w.country === '*' ? (
                    <span className="muted">Any other country</span>
                  ) : (
                    <input value={w.country} placeholder="e.g. Germany" onChange={(e) => update((a) => void (a.workAuth[i].country = e.target.value))} />
                  )}
                </td>
                <td>
                  <input value={w.authorized} placeholder="Yes / No" onChange={(e) => update((a) => void (a.workAuth[i].authorized = e.target.value))} />
                </td>
                <td>
                  <input value={w.sponsorship} placeholder="Yes / No" onChange={(e) => update((a) => void (a.workAuth[i].sponsorship = e.target.value))} />
                </td>
                <td>
                  <input
                    value={w.note ?? ''}
                    placeholder="e.g. Working Holiday visa"
                    onChange={(e) => update((a) => void (a.workAuth[i].note = e.target.value || undefined))}
                  />
                </td>
                <td className="nowrap">
                  {w.country !== '*' && (
                    <button className="icon danger-text" aria-label="Remove" onClick={() => update((a) => void a.workAuth.splice(i, 1))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="small-btn"
          onClick={() =>
            update((a) => {
              // New countries go above the catch-all row.
              const at = a.workAuth.findIndex((w) => w.country === '*');
              a.workAuth.splice(at < 0 ? a.workAuth.length : at, 0, { id: newId('wa-'), country: '', authorized: '', sponsorship: '' });
            })
          }
        >
          + Add country
        </button>
      </div>

      <div className="card">
        <h3>Other questions</h3>
        <p className="muted small">
          A question containing these words gets this answer, e.g. "how did you hear" → "Job board". Checked before
          everything above, so they can also override it.
        </p>
        <table className="contacts-table">
          <thead>
            <tr>
              <th>Question contains</th>
              <th>Answer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.custom.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <input value={c.pattern} placeholder="e.g. relocate" onChange={(e) => update((a) => void (a.custom[i].pattern = e.target.value))} />
                </td>
                <td>
                  <input value={c.answer} placeholder="e.g. Yes" onChange={(e) => update((a) => void (a.custom[i].answer = e.target.value))} />
                </td>
                <td className="nowrap">
                  <button className="icon danger-text" aria-label="Remove" onClick={() => update((a) => void a.custom.splice(i, 1))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small-btn" onClick={() => update((a) => void a.custom.push({ id: newId('q-'), pattern: '', answer: '' }))}>
          + Add question
        </button>
      </div>
    </>
  );
}
