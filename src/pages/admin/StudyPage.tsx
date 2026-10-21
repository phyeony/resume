import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadStudy, saveStudy } from './store';
import { ALL_PROBLEMS, CHEAT_SHEET, CONSTRAINTS, PATTERNS, QUIZ, WEEKS, nextProblem, problemUrl, type Pattern } from '../../study/patterns';
import './study.css';

const TABS = [
  { key: 'patterns', label: 'Patterns' },
  { key: 'spot', label: 'Spot it' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'plan', label: 'Plan' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const patternName = (key: string) => PATTERNS.find((p) => p.key === key)?.name ?? key;

export function StudyPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : 'patterns';
  const [solved, setSolved] = useState<Set<number> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadStudy()
      .then((s) => setSolved(new Set(s?.solved ?? [])))
      .catch((e: unknown) => {
        setError(`Couldn't load your progress: ${String(e)}`);
        setSolved(new Set());
      });
  }, []);

  const next = useMemo(() => (solved ? nextProblem(solved) : null), [solved]);

  // Open the pattern you're working on once progress arrives.
  useEffect(() => {
    if (solved && open === null) setOpen(next?.pattern.key ?? '');
  }, [solved, next, open]);

  function toggle(id: number) {
    if (!solved) return;
    const updated = new Set(solved);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setSolved(updated);
    setError('');
    saveStudy({ solved: [...updated].sort((a, b) => a - b), updatedAt: Date.now() }).catch((e: unknown) =>
      setError(`Couldn't save that change: ${String(e)}`),
    );
  }

  function goToPattern(key: string) {
    setOpen(key);
    setParams({ tab: 'patterns' });
    requestAnimationFrame(() => document.getElementById(`pattern-${key}`)?.scrollIntoView({ block: 'start' }));
  }

  const done = solved ? ALL_PROBLEMS.filter((p) => solved.has(p.id)).length : 0;

  return (
    <div className="pad study">
      <div className="study-head">
        <h1>Coding interview study</h1>
        <p className="muted">
          Learn a pattern's cues and template, then solve its problems from easy to disguised. Before you code, say "this is ___ because ___".
        </p>
      </div>

      <div className="card study-next">
        <div className="study-progress">
          <span className="study-bar" aria-hidden="true">
            <span style={{ width: `${(done / ALL_PROBLEMS.length) * 100}%` }} />
          </span>
          <span className="small muted tabular">
            {done} of {ALL_PROBLEMS.length} solved
          </span>
        </div>
        {solved === null ? (
          <p className="muted">Loading your progress…</p>
        ) : next ? (
          <div className="study-up-next">
            <span className="small muted">Up next · {next.pattern.name}</span>
            <a href={problemUrl(next.problem)} target="_blank" rel="noopener" className="study-up-title">
              {next.problem.id}. {next.problem.title} ↗
            </a>
            <button className="link small" onClick={() => goToPattern(next.pattern.key)}>
              Review the template
            </button>
          </div>
        ) : (
          <p className="ok-text">Every problem is checked off. Move on to NeetCode 150 or Grind 75 and your target companies' tagged problems.</p>
        )}
        {error && <p className="error small">{error}</p>}
      </div>

      <div className="study-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'patterns' && (
        <div className="study-patterns">
          {PATTERNS.map((pt, i) => (
            <PatternCard
              key={pt.key}
              index={i + 1}
              pattern={pt}
              solved={solved}
              open={open === pt.key}
              onOpen={(o) => setOpen(o ? pt.key : '')}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      {tab === 'spot' && (
        <>
          <h2 className="study-h2">Recognition cheat sheet</h2>
          <p className="muted">Scan the problem for these phrases. When two rows match, the input shape usually decides.</p>
          <div className="study-cues">
            {CHEAT_SHEET.map((row) => (
              <button key={row.cue} className="study-cue" onClick={() => goToPattern(row.pattern)}>
                <span>{row.cue}</span>
                <strong>{row.label ?? patternName(row.pattern)} →</strong>
              </button>
            ))}
          </div>

          <h2 className="study-h2">The constraints leak the answer</h2>
          <p className="muted">Judges run about 10⁸ simple steps per second, so the input size tells you the expected Big-O.</p>
          <div className="study-table">
            <table>
              <thead>
                <tr>
                  <th>Input size</th>
                  <th>Target</th>
                  <th>Usually means</th>
                </tr>
              </thead>
              <tbody>
                {CONSTRAINTS.map((c) => (
                  <tr key={c.n}>
                    <td className="nowrap">{c.n}</td>
                    <td className="nowrap">
                      <code>{c.big}</code>
                    </td>
                    <td>{c.means}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'quiz' && <Quiz />}

      {tab === 'plan' && <Plan solved={solved} onPattern={goToPattern} />}
    </div>
  );
}

function PatternCard(props: {
  index: number;
  pattern: Pattern;
  solved: Set<number> | null;
  open: boolean;
  onOpen(open: boolean): void;
  onToggle(id: number): void;
}) {
  const { index, pattern, solved, open, onOpen, onToggle } = props;
  const n = solved ? pattern.problems.filter((p) => solved.has(p.id)).length : 0;
  const total = pattern.problems.length;
  return (
    <details id={`pattern-${pattern.key}`} className="card study-pattern" open={open} onToggle={(e) => {
      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
      if (isOpen !== open) onOpen(isOpen);
    }}>
      <summary>
        <span className="study-num">{index}</span>
        <span className="grow">{pattern.name}</span>
        <span className={`small tabular ${n === total ? 'ok-text' : 'muted'}`}>
          {n}/{total}
        </span>
      </summary>
      <p>{pattern.summary}</p>
      <div className="study-cols">
        <div>
          <div className="study-label">Cues</div>
          <ul className="study-cuelist">
            {pattern.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="study-label">Template</div>
          <Code src={pattern.template} />
        </div>
        <div>
          <div className="study-label">Problems</div>
          <ol className="study-ladder">
            {pattern.problems.map((p) => {
              const id = `lc-${p.id}`;
              const checked = solved?.has(p.id) ?? false;
              return (
                <li key={p.id} className={checked ? 'done' : ''}>
                  <input id={id} type="checkbox" checked={checked} disabled={!solved} onChange={() => onToggle(p.id)} aria-label={`Solved ${p.title}`} />
                  <span className={`study-diff ${p.diff}`}>{p.diff}</span>
                  <a href={problemUrl(p)} target="_blank" rel="noopener">
                    <span className="muted tabular">{p.id}.</span> {p.title}
                  </a>
                </li>
              );
            })}
          </ol>
          {pattern.tip && <p className="small muted study-tip">{pattern.tip}</p>}
        </div>
      </div>
    </details>
  );
}

/** Python with `#` comments muted. Templates have no `#` inside strings. */
function Code({ src }: { src: string }) {
  return (
    <pre className="study-code">
      <code>
        {src.split('\n').map((line, i) => {
          const at = line.indexOf('#');
          return (
            <span key={i}>
              {at < 0 ? line : line.slice(0, at)}
              {at >= 0 && <span className="muted">{line.slice(at)}</span>}
              {'\n'}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

function Quiz() {
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
      <h2 className="study-h2">Name that pattern</h2>
      <p className="muted">Decide the pattern and the cue that gave it away, then tap to check.</p>
      <div className="study-quiz">
        {QUIZ.map((q, i) => (
          <button key={q.q} className="card study-q" onClick={() => reveal(i)} aria-expanded={shown.has(i)}>
            <span>{q.q}</span>
            {shown.has(i) ? (
              <span className="study-a">
                <strong>{q.pattern}.</strong> {q.why}
              </span>
            ) : (
              <span className="small muted">Tap to reveal</span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

function Plan({ solved, onPattern }: { solved: Set<number> | null; onPattern(key: string): void }) {
  return (
    <>
      <h2 className="study-h2">How to study</h2>
      <ol className="study-steps">
        <li>
          <strong>One pattern at a time.</strong> Solve the first problem while looking at the template. The template is what you're learning.
        </li>
        <li>
          <strong>Name the pattern before you code.</strong> Write "this is ___ because ___", where the "because" points at words in the problem.
        </li>
        <li>
          <strong>25-minute limit.</strong> No working idea by then? Read the hint, then the solution. Close it and rewrite from a blank file.
        </li>
        <li>
          <strong>Redo, don't just review.</strong> Re-solve anything you needed help on after 3 days and again after 7. It's learned when you solve it cold in under 20 minutes.
        </li>
        <li>
          <strong>Practice out loud.</strong> Restate the problem, walk an example, give the brute force and its Big-O, improve it, code it, then trace a test by hand.
        </li>
      </ol>

      <h2 className="study-h2">8 weeks, about an hour a day</h2>
      <div className="study-weeks">
        {WEEKS.map((w) => {
          const probs = w.patterns.flatMap((k) => PATTERNS.find((p) => p.key === k)?.problems ?? []);
          const n = solved ? probs.filter((p) => solved.has(p.id)).length : 0;
          return (
            <div key={w.week} className="card study-week">
              <div className="study-label">Week {w.week}</div>
              <p>{w.text}</p>
              <div className="study-week-links">
                {w.patterns.map((k) => (
                  <button key={k} className="link small" onClick={() => onPattern(k)}>
                    {patternName(k)}
                  </button>
                ))}
                <span className="small muted tabular">
                  {n}/{probs.length}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small">After week 8, work through NeetCode 150 or Grind 75, and before each interview solve that company's recent tagged problems.</p>
    </>
  );
}
