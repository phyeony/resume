import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadInterview, saveInterview } from './store';
import {
  ALL_KEYS,
  BEHAVIOURAL,
  DESIGNS,
  DESIGN_STEPS,
  NUMBERS,
  PITCH,
  QUESTIONS_TO_ASK,
  STAR_TIPS,
  STORIES,
  gapCount,
  splitGaps,
  type DesignQuestion,
  type FollowUp,
  type InterviewProgress,
  type Story,
} from '../../interview/prep';
import './study.css';
import './interview.css';

const TABS = [
  { key: 'stories', label: 'Stories' },
  { key: 'questions', label: 'Questions' },
  { key: 'design', label: 'System design' },
  { key: 'pitch', label: 'Intro & tips' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const storyTitle = (key: string) => STORIES.find((s) => s.key === key)?.title ?? key;

export function InterviewPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : 'stories';
  const [progress, setProgress] = useState<InterviewProgress | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadInterview()
      .then((p) => setProgress(p ?? { practiced: [], notes: {}, updatedAt: 0 }))
      .catch((e: unknown) => {
        setError(`Couldn't load your notes: ${String(e)}`);
        setProgress({ practiced: [], notes: {}, updatedAt: 0 });
      });
  }, []);

  function save(next: InterviewProgress) {
    setProgress(next);
    setError('');
    saveInterview(next).catch((e: unknown) => setError(`Couldn't save that change: ${String(e)}`));
  }

  function togglePracticed(key: string) {
    if (!progress) return;
    const set = new Set(progress.practiced);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    save({ ...progress, practiced: ALL_KEYS.filter((k) => set.has(k)), updatedAt: Date.now() });
  }

  function saveNote(key: string, text: string) {
    if (!progress || (progress.notes[key] ?? '') === text) return;
    const notes = { ...progress.notes };
    if (text.trim()) notes[key] = text;
    else delete notes[key];
    save({ ...progress, notes, updatedAt: Date.now() });
  }

  function goToStory(key: string) {
    setOpen(key);
    setParams({ tab: 'stories' });
    requestAnimationFrame(() => document.getElementById(`story-${key}`)?.scrollIntoView({ block: 'start' }));
  }

  const practiced = progress ? ALL_KEYS.filter((k) => progress.practiced.includes(k)).length : 0;
  const gaps = STORIES.reduce((n, s) => n + gapCount(s), 0);

  const card = (key: string) => ({
    open: open === key,
    onOpen: (o: boolean) => setOpen(o ? key : null),
    practiced: progress?.practiced.includes(key) ?? false,
    onPracticed: () => togglePracticed(key),
    note: progress?.notes[key] ?? '',
    onNote: (t: string) => saveNote(key, t),
    ready: progress !== null,
  });

  return (
    <div className="pad study interview">
      <div className="study-head">
        <h1>Interview prep</h1>
        <p className="muted">
          Behavioural stories and system design questions built from your resume. <mark className="gap">Highlighted</mark> parts are facts only you know: fill them in under
          "Your notes" on each card, then practise each one out loud and check it off.
        </p>
      </div>

      <div className="card study-next">
        <div className="study-progress">
          <span className="study-bar" aria-hidden="true">
            <span style={{ width: `${(practiced / ALL_KEYS.length) * 100}%` }} />
          </span>
          <span className="small muted tabular">
            {practiced} of {ALL_KEYS.length} practised
          </span>
        </div>
        <p className="small muted">
          {STORIES.length} stories with {gaps} facts to fill in · {DESIGNS.length} design questions. Your notes are saved to your account only; the prompts on this page ship with the site.
        </p>
        {error && <p className="error small">{error}</p>}
      </div>

      <div className="study-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stories' && (
        <div className="study-patterns">
          {STORIES.map((s, i) => (
            <StoryCard key={s.key} index={i + 1} story={s} {...card(s.key)} />
          ))}
        </div>
      )}

      {tab === 'questions' && <Questions onStory={goToStory} />}

      {tab === 'design' && (
        <>
          <h2 className="study-h2">45 minutes, in five steps</h2>
          <p className="muted">Intern interviews care more about clear reasoning and trade-offs than a perfect architecture. Talk the whole time.</p>
          <ol className="study-steps">
            {DESIGN_STEPS.map((s) => (
              <li key={s.step}>
                <strong>{s.step}.</strong> {s.text}
              </li>
            ))}
          </ol>

          <h2 className="study-h2">Systems you built</h2>
          <p className="muted">Expect these whenever an interviewer reads your resume. They will push on the edge cases.</p>
          <div className="study-patterns">
            {DESIGNS.filter((d) => d.kind === 'yours').map((d, i) => (
              <DesignCard key={d.key} index={i + 1} design={d} {...card(d.key)} />
            ))}
          </div>

          <h2 className="study-h2">Common intern questions</h2>
          <p className="muted">Each one links back to something you've done. Use it: "I hit this at…" beats theory.</p>
          <div className="study-patterns">
            {DESIGNS.filter((d) => d.kind === 'classic').map((d, i) => (
              <DesignCard key={d.key} index={i + 1} design={d} {...card(d.key)} />
            ))}
          </div>

          <h2 className="study-h2">Numbers to estimate with</h2>
          <div className="study-table">
            <table>
              <tbody>
                {NUMBERS.map((n) => (
                  <tr key={n.n}>
                    <td className="nowrap">
                      <strong>{n.n}</strong>
                    </td>
                    <td>{n.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'pitch' && (
        <>
          <h2 className="study-h2">{PITCH.title}</h2>
          <p className="muted">Your opening answer in almost every interview.</p>
          <div className="card interview-pitch">
            {PITCH.lines.map((l) => (
              <p key={l}>
                <Gaps text={l} />
              </p>
            ))}
          </div>
          <ul className="study-cuelist">
            {PITCH.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <NoteBox {...card('pitch')} />

          <h2 className="study-h2">Answering with STAR</h2>
          <p className="muted">Situation, Task, Action, Result.</p>
          <ul className="study-cuelist">
            {STAR_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <h2 className="study-h2">Questions to ask them</h2>
          <p className="muted">Have two ready. Skip any they already answered.</p>
          <ul className="study-cuelist">
            {QUESTIONS_TO_ASK.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Gaps({ text }: { text: string }) {
  return (
    <>
      {splitGaps(text).map((r, i) =>
        r.gap ? (
          <mark key={i} className="gap">
            {r.text}
          </mark>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

interface CardProps {
  index: number;
  open: boolean;
  onOpen(open: boolean): void;
  practiced: boolean;
  onPracticed(): void;
  note: string;
  onNote(text: string): void;
  ready: boolean;
}

function Card(props: CardProps & { id: string; title: string; meta: ReactNode; children: ReactNode }) {
  const { id, index, title, meta, open, onOpen, practiced, children } = props;
  return (
    <details id={id} className="card study-pattern" open={open} onToggle={(e) => {
      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
      if (isOpen !== open) onOpen(isOpen);
    }}>
      <summary>
        <span className="study-num">{index}</span>
        <span className="grow">{title}</span>
        {practiced ? <span className="small ok-text">Practised</span> : meta}
      </summary>
      <div className="interview-body">
        {children}
        <NoteBox {...props} />
      </div>
    </details>
  );
}

function NoteBox({ note, onNote, practiced, onPracticed, ready }: Pick<CardProps, 'note' | 'onNote' | 'practiced' | 'onPracticed' | 'ready'>) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  return (
    <div className="interview-notes">
      <label className="study-label">
        Your notes
        <textarea
          rows={3}
          value={draft}
          disabled={!ready}
          placeholder="Fill in the highlighted facts, numbers, and the wording that works for you"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onNote(draft)}
        />
      </label>
      <label className="interview-check">
        <input type="checkbox" checked={practiced} disabled={!ready} onChange={onPracticed} />
        Practised out loud
      </label>
    </div>
  );
}

function FollowUps({ items, label }: { items: FollowUp[]; label: string }) {
  if (!items.length) return null;
  return (
    <>
      <div className="study-label">{label}</div>
      <div className="interview-followups">
        {items.map((f) => (
          <details key={f.q} className="interview-fu">
            <summary>{f.q}</summary>
            <p>
              <Gaps text={f.a} />
            </p>
          </details>
        ))}
      </div>
    </>
  );
}

function StoryCard(props: CardProps & { story: Story }) {
  const { story: s } = props;
  const gaps = gapCount(s);
  return (
    <Card {...props} id={`story-${s.key}`} title={s.title} meta={<span className="small muted tabular">{gaps ? `${gaps} to fill` : 'Ready'}</span>}>
      <p className="small muted interview-where">
        {s.where} · {s.shows.join(', ')}
      </p>
      <dl className="interview-star">
        <dt>Situation</dt>
        <dd>
          <Gaps text={s.situation} />
        </dd>
        <dt>Task</dt>
        <dd>
          <Gaps text={s.task} />
        </dd>
        <dt>Action</dt>
        <dd>
          <ul>
            {s.action.map((a) => (
              <li key={a}>
                <Gaps text={a} />
              </li>
            ))}
          </ul>
        </dd>
        <dt>Result</dt>
        <dd>
          <Gaps text={s.result} />
        </dd>
      </dl>
      <FollowUps items={s.followUps} label="Follow-ups to expect" />
    </Card>
  );
}

function DesignCard(props: CardProps & { design: DesignQuestion }) {
  const { design: d } = props;
  return (
    <Card {...props} id={`design-${d.key}`} title={d.title} meta={<span className="small muted">{d.kind === 'yours' ? 'Yours' : 'Classic'}</span>}>
      <p className="interview-prompt">“{d.prompt}”</p>
      <div className="study-cols interview-cols">
        <div>
          <div className="study-label">Ask first</div>
          <ul className="study-cuelist">
            {d.clarify.map((c) => (
              <li key={c}>
                <Gaps text={c} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="study-label">Design</div>
          <ol className="interview-design">
            {d.design.map((c) => (
              <li key={c}>
                <Gaps text={c} />
              </li>
            ))}
          </ol>
        </div>
      </div>
      <FollowUps items={d.deepDives} label="Deep dives" />
      {d.tieIn && <p className="small study-tip interview-tie">{d.tieIn}</p>}
    </Card>
  );
}

function Questions({ onStory }: { onStory(key: string): void }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const reveal = (i: number) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <>
      <h2 className="study-h2">Which story would you tell?</h2>
      <p className="muted">Pick a story before you look. Most questions have two or three good answers.</p>
      <div className="study-quiz">
        {BEHAVIOURAL.map((q, i) => (
          <div key={q.q} className="card study-q interview-q">
            <button className="link interview-q-btn" onClick={() => reveal(i)} aria-expanded={shown.has(i)}>
              <span>{q.q}</span>
              {!shown.has(i) && <span className="small muted">Tap to reveal</span>}
            </button>
            {shown.has(i) && (
              <div className="study-a">
                <span>{q.tip}</span>
                {q.stories.length > 0 && (
                  <span className="interview-story-links">
                    {q.stories.map((k) => (
                      <button key={k} className="link small" onClick={() => onStory(k)}>
                        {storyTitle(k)} →
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
