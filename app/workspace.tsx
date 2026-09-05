'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Code2,
  Play,
  Upload,
  Plus,
  BookOpen,
  FlaskConical,
  ShieldCheck,
  Settings,
  RotateCcw,
  Square,
  Check,
  Lightbulb,
  ExternalLink,
  LoaderCircle,
  ArrowRight,
  History,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import CodeEditor from './code-editor';
import { seeds } from '@/lib/seeds';
import { runCode } from '@/lib/runner';
import {
  CaseSchema,
  type Problem,
  type Language,
  type Result,
} from '@/lib/problem';
type Attempt = {
  id: string;
  language: Language;
  code: string;
  verdict: string;
  passed: number;
  total: number;
  created: number;
};
async function api(path: string, data?: unknown, signal?: AbortSignal) {
  const r = await fetch('/api/' + path, {
    ...(data
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      : {}),
    signal,
  });
  const json = (await r.json()) as {
    error?: string;
    problems: Problem[];
    submissions: Attempt[];
    problem: Problem;
    answer: string;
    gemini: boolean;
    tavily: boolean;
  };
  if (!r.ok) throw new Error(json.error || 'Request failed.');
  return json;
}
const pretty = (v: unknown) => JSON.stringify(v, null, 2) ?? 'No return value';
export default function Workspace() {
  const [problems, setProblems] = useState<Problem[]>(seeds),
    [selected, setSelected] = useState(seeds[0].id),
    [language, setLanguage] = useState<Language>('python'),
    [code, setCode] = useState(seeds[0].starter.python),
    [tab, setTab] = useState('description'),
    [testTab, setTestTab] = useState('cases'),
    [caseIndex, setCaseIndex] = useState(0),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [newOpen, setNewOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [prompt, setPrompt] = useState(''),
    [search, setSearch] = useState(true),
    [draft, setDraft] = useState<Problem | null>(null),
    [geminiKey, setGeminiKey] = useState(''),
    [tavilyKey, setTavilyKey] = useState(''),
    [configured, setConfigured] = useState({ gemini: false, tavily: false }),
    [hints, setHints] = useState(0),
    [reveal, setReveal] = useState(false),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState(''),
    [custom, setCustom] = useState(false),
    [customArgs, setCustomArgs] = useState(''),
    [customExpected, setCustomExpected] = useState(''),
    [resetOpen, setResetOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const drafts = useRef<Record<string, string>>({});
  const problem = problems.find((p) => p.id === selected) || seeds[0];
  useEffect(() => {
    api('library')
      .then((r) => setProblems([...seeds, ...r.problems]))
      .catch((e) => setError(e.message));
    api('status')
      .then(setConfigured)
      .catch(() => {});
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    let active = true;
    api('submissions?problemId=' + encodeURIComponent(selected))
      .then((r) => {
        if (active) setAttempts(r.submissions);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selected]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem('forge-draft:two-sum:python');
        if (saved !== null) {
          drafts.current['two-sum:python'] = saved;
          setCode(saved);
        }
      } catch {}
    });
    return () => {
      active = false;
    };
  }, []);
  const updateCode = (value: string) => {
    setCode(value);
    drafts.current[selected + ':' + language] = value;
    try {
      localStorage.setItem('forge-draft:' + selected + ':' + language, value);
    } catch {}
  };
  function choose(p: Problem, nextLang = language) {
    controller.current?.abort();
    setAttempts([]);
    try {
      const saved = localStorage.getItem(
        'forge-draft:' + p.id + ':' + nextLang,
      );
      if (saved !== null) drafts.current[p.id + ':' + nextLang] = saved;
    } catch {}
    setSelected(p.id);
    setLanguage(nextLang);
    setCode(drafts.current[p.id + ':' + nextLang] ?? p.starter[nextLang]);
    setResults([]);
    setCaseIndex(0);
    setHints(0);
    setReveal(false);
    setAnswer('');
    setCustom(false);
    setTab('description');
    setError('');
    setNotice('');
  }
  async function execute(submit: boolean) {
    setError('');
    setNotice('');
    setResults([]);
    setBusy(
      language === 'python' ? 'Loading Python, then running…' : 'Running…',
    );
    const abort = new AbortController();
    controller.current = abort;
    try {
      const tests =
        custom && !submit
          ? [
              CaseSchema.parse({
                args: JSON.parse(customArgs),
                expected: JSON.parse(customExpected),
                label: 'Custom case',
              }),
            ]
          : submit
            ? problem.tests
            : problem.tests.slice(0, 2);
      const output = await runCode(
        code,
        language,
        tests,
        problem.comparison,
        abort.signal,
      );
      setResults(output);
      setTestTab('results');
      const passed = output.filter((r) => r.passed).length;
      const verdict = output.some((r) => r.error)
        ? 'Runtime error'
        : passed === output.length
          ? 'Accepted'
          : 'Wrong answer';
      setNotice(
        submit
          ? `${verdict} · ${passed}/${output.length} tests`
          : `${passed}/${output.length} examples passed`,
      );
      if (submit) {
        await api('submissions', {
          problemId: problem.id,
          language,
          code,
          verdict,
          passed,
          total: output.length,
        });
        const r = await api(
          'submissions?problemId=' + encodeURIComponent(problem.id),
        );
        setAttempts(r.submissions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed.');
    } finally {
      setBusy('');
      controller.current = null;
    }
  }
  async function generate() {
    setError('');
    setDraft(null);
    setBusy(
      search
        ? 'Researching public sources and building tests…'
        : 'Building an original problem…',
    );
    const abort = new AbortController();
    controller.current = abort;
    try {
      const r = await api(
        'research',
        { prompt, search, geminiKey, tavilyKey },
        abort.signal,
      );
      setDraft(r.problem);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy('');
      controller.current = null;
    }
  }
  async function verifyAndSave() {
    if (!draft) return;
    setError('');
    setBusy('Checking Python and JavaScript reference solutions…');
    const abort = new AbortController();
    controller.current = abort;
    try {
      for (const lang of ['python', 'javascript'] as Language[]) {
        const checked = await runCode(
          draft.reference[lang],
          lang,
          draft.tests,
          draft.comparison,
          abort.signal,
        );
        const failures = checked.filter((r) => !r.passed);
        if (failures.length)
          throw new Error(
            `${lang} reference failed ${failures.length} tests (${failures[0].label}). Regenerate with a more precise prompt.`,
          );
      }
      const r = await api(
        'library',
        { ...draft, verification: 'reference-checked' },
        abort.signal,
      );
      setProblems((p) => [...p, r.problem]);
      choose(r.problem);
      setDraft(null);
      setNewOpen(false);
      setNotice(
        'Problem saved. Both reference implementations passed the generated tests.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setBusy('');
      controller.current = null;
    }
  }
  async function help() {
    setError('');
    setBusy('Thinking through your question…');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const r = await api(
        'help',
        { statement: problem.statement, code, language, question, geminiKey },
        abort.signal,
      );
      setAnswer(r.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Help unavailable.');
    } finally {
      setBusy('');
      controller.current = null;
    }
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifetime = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'list_practice_problems',
            description:
              'Read the available practice problem titles and current selection.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object.');
              return {
                selected,
                problems: problems.map((p) => ({
                  id: p.id,
                  title: p.title,
                  difficulty: p.difficulty,
                })),
              };
            },
          },
          { signal: lifetime.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifetime.abort();
  }, [problems, selected]);
  const test = problem.tests[Math.min(caseIndex, problem.tests.length - 1)];
  return (
    <main className="forge">
      <header>
        <div className="brand">
          <Code2 />
          <strong>
            practice<span>forge</span>
          </strong>
        </div>
        <span className="muted">Your personal coding workspace</span>
        <button
          className="primary"
          onClick={() => {
            setError('');
            setNewOpen(true);
          }}
          disabled={!!busy}
        >
          <Plus size={16} /> New problem
        </button>
        <button
          aria-label="Settings"
          className="icon-button"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={18} />
        </button>
      </header>
      <div className="workspace">
        <aside className="library">
          <h2>
            <BookOpen size={17} /> My problems{' '}
            <span className="count">{problems.length}</span>
          </h2>
          <div className="problem-list">
            {problems.map((p, i) => (
              <button
                key={p.id}
                disabled={!!busy}
                className={
                  'problem-item ' + (p.id === selected ? 'active' : '')
                }
                onClick={() => choose(p)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  {p.title}
                  <small className={p.difficulty.toLowerCase()}>
                    {p.difficulty} · {p.tags[0]}
                  </small>
                </div>
              </button>
            ))}
          </div>
          <button
            className="add-problem"
            onClick={() => setNewOpen(true)}
            disabled={!!busy}
          >
            <Plus size={15} /> Add an idea
          </button>
          <div className="library-foot">
            <ShieldCheck size={16} /> Private workspace
          </div>
        </aside>
        <section className="panel description">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList variant="line">
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="hints">Hints</TabsTrigger>
              <TabsTrigger value="history">Submissions</TabsTrigger>
            </TabsList>
            <TabsContent value="description">
              <div className="problem-copy">
                <div className="eyebrow">{problem.tags.join(' / ')}</div>
                <h1>{problem.title}</h1>
                <div className="badges">
                  <span className={'badge ' + problem.difficulty.toLowerCase()}>
                    {problem.difficulty}
                  </span>
                  <span className="badge">
                    {problem.verification === 'built-in'
                      ? 'Starter problem'
                      : 'References checked'}
                  </span>
                </div>
                <p className="preserve">{problem.statement}</p>
                <h3>Function signature</h3>
                <pre>solve({problem.parameters.join(', ')})</pre>
                {problem.tests.slice(0, 2).map((t, i) => (
                  <div key={i}>
                    <h3>Example {i + 1}</h3>
                    <pre>
                      <span className="muted">Arguments</span>
                      {'\n'}
                      {JSON.stringify(t.args)}
                      {'\n'}
                      <span className="muted">Expected</span>
                      {'\n'}
                      {JSON.stringify(t.expected)}
                    </pre>
                  </div>
                ))}
                <h3>Constraints</h3>
                <ul>
                  {problem.constraints.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {problem.assumptions.length > 0 && (
                  <>
                    <h3>Assumptions & interpretation</h3>
                    <ul>
                      {problem.assumptions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
                {problem.sources.length > 0 && (
                  <>
                    <h3>Research sources</h3>
                    <p className="muted">
                      Public sources used to reconstruct this exercise. Tests
                      and wording are generated, not official LeetCode content.
                    </p>
                    {problem.sources.map((s) => (
                      <a
                        className="source"
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        key={s.url}
                      >
                        {s.title}
                        <ExternalLink size={13} />
                      </a>
                    ))}
                  </>
                )}
              </div>
            </TabsContent>
            <TabsContent value="hints">
              <div className="problem-copy">
                <div className="eyebrow">ONE STEP AT A TIME</div>
                <h1>A little nudge</h1>
                <p>Start small. Reveal only as much as you need.</p>
                {problem.hints.slice(0, hints).map((h, i) => (
                  <div className="hint" key={i}>
                    <Lightbulb size={17} />
                    <div>
                      <small>HINT {i + 1}</small>
                      <p>{h}</p>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setHints(hints + 1)}
                  disabled={hints >= problem.hints.length}
                >
                  <Lightbulb size={15} />
                  {hints ? 'Reveal next hint' : 'Reveal first hint'}
                </button>
                <h3>Ask about your approach</h3>
                <textarea
                  aria-label="Question for tutor"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Why does my solution fail on duplicates?"
                  maxLength={1500}
                />
                <button
                  disabled={!!busy || question.trim().length < 3}
                  onClick={help}
                >
                  Ask tutor <ArrowRight size={15} />
                </button>
                {answer && <p className="hint-answer preserve">{answer}</p>}
                <h3>Solution walkthrough</h3>
                {!reveal ? (
                  <button onClick={() => setReveal(true)}>
                    Reveal solution
                  </button>
                ) : (
                  <>
                    <p>{problem.explanation}</p>
                    <p className="easy">{problem.complexity}</p>
                    <pre>{problem.reference[language]}</pre>
                  </>
                )}
              </div>
            </TabsContent>
            <TabsContent value="history">
              <div className="problem-copy">
                <h1>Your attempts</h1>
                <p className="muted">
                  Submissions are saved privately. Restoring an attempt replaces
                  the editor draft.
                </p>
                {!attempts.length && (
                  <div className="empty-state">
                    <History />
                    <p>No submissions yet.</p>
                    <span className="muted">
                      Write a solution and press Submit.
                    </span>
                  </div>
                )}
                {attempts.map((a) => (
                  <div className="attempt" key={a.id}>
                    <div>
                      <strong
                        className={a.verdict === 'Accepted' ? 'easy' : 'hard'}
                      >
                        {a.verdict}
                      </strong>
                      <small>
                        {a.passed}/{a.total} tests · {a.language} ·{' '}
                        {new Date(a.created).toLocaleString()}
                      </small>
                    </div>
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        drafts.current[selected + ':' + a.language] = a.code;
                        try {
                          localStorage.setItem(
                            'forge-draft:' + selected + ':' + a.language,
                            a.code,
                          );
                        } catch {}
                        setLanguage(a.language);
                        setCode(a.code);
                        setNotice('Submission restored in the editor.');
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </section>
        <section className="coding">
          <div className="panel editor">
            <div className="panel-bar">
              <span>
                <Code2 size={16} /> Code
              </span>
              <div className="editor-actions">
                <Select
                  value={language}
                  onValueChange={(v) => v && choose(problem, v as Language)}
                  disabled={!!busy}
                >
                  <SelectTrigger aria-label="Programming language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python 3</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  aria-label="Reset editor"
                  className="icon-button"
                  onClick={() => setResetOpen(true)}
                  disabled={!!busy}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>
            <CodeEditor
              value={code}
              language={language}
              onChange={updateCode}
            />
            <div className="editor-foot">
              <span>
                {language === 'python' ? 'Python 3.12' : 'JavaScript'} · 4
                spaces
              </span>
              <span>Suggestions off · Draft saved on this device</span>
            </div>
          </div>
          <div className="panel tests">
            <Tabs value={testTab} onValueChange={(v) => setTestTab(String(v))}>
              <TabsList variant="line" className="test-tabs">
                <TabsTrigger value="cases">
                  <FlaskConical size={15} /> Test cases
                </TabsTrigger>
                <TabsTrigger value="results">
                  Results{' '}
                  {results.length > 0 && (
                    <span className="count">
                      {results.filter((r) => r.passed).length}/{results.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="cases">
                <div className="test-content">
                  <div className="case-buttons">
                    {problem.tests.slice(0, 2).map((_, i) => (
                      <button
                        className={
                          !custom && caseIndex === i ? 'case-active' : ''
                        }
                        key={i}
                        onClick={() => {
                          setCaseIndex(i);
                          setCustom(false);
                        }}
                      >
                        Case {i + 1}
                      </button>
                    ))}
                    <button
                      className={custom ? 'case-active' : ''}
                      onClick={() => {
                        setCustom(true);
                        setCustomArgs(JSON.stringify(test.args));
                        setCustomExpected(JSON.stringify(test.expected));
                      }}
                    >
                      <Plus size={13} /> Custom
                    </button>
                    <span className="muted">
                      {problem.tests.length} submission tests
                    </span>
                  </div>
                  {custom ? (
                    <div className="custom-grid">
                      <label>
                        Arguments (JSON array)
                        <textarea
                          value={customArgs}
                          onChange={(e) => setCustomArgs(e.target.value)}
                          spellCheck={false}
                        />
                      </label>
                      <label>
                        Expected output (JSON)
                        <textarea
                          value={customExpected}
                          onChange={(e) => setCustomExpected(e.target.value)}
                          spellCheck={false}
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <p className="muted">
                        Arguments · {problem.parameters.join(', ')}
                      </p>
                      <pre>{JSON.stringify(test.args)}</pre>
                      <p className="muted">
                        Expected <code>{JSON.stringify(test.expected)}</code>
                      </p>
                    </>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="results">
                <div className="test-content">
                  {!results.length ? (
                    <p className="muted">
                      Run your solution to see results here.
                    </p>
                  ) : (
                    results.map((r, i) => (
                      <details className="result" key={i} open={!r.passed}>
                        <summary>
                          <span className={r.passed ? 'easy' : 'hard'}>
                            {r.passed ? '✓' : '×'} {r.label}
                          </span>
                          <span className="muted">
                            {r.duration.toFixed(1)} ms
                          </span>
                        </summary>
                        <pre>
                          {r.error ||
                            `Expected: ${pretty(r.expected)}\nReturned: ${pretty(r.actual)}`}
                          {r.stdout && `\nOutput:\n${r.stdout}`}
                        </pre>
                      </details>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          {(error || notice || busy) && (
            <div
              className={'status ' + (error ? 'error' : '')}
              role={error ? 'alert' : 'status'}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  {busy}
                </>
              ) : (
                error || notice
              )}
            </div>
          )}
          <div className="runbar">
            <span className="muted">
              <ShieldCheck size={13} /> Browser sandbox · 5s limit
            </span>
            {busy ? (
              <button onClick={() => controller.current?.abort()}>
                <Square size={14} /> Stop
              </button>
            ) : (
              <>
                <button onClick={() => execute(false)}>
                  <Play size={15} /> Run
                </button>
                <button className="primary" onClick={() => execute(true)}>
                  <Upload size={15} /> Submit
                </button>
              </>
            )}
          </div>
        </section>
      </div>
      <Dialog
        open={newOpen}
        onOpenChange={(v) => {
          if (!busy) setNewOpen(v);
        }}
      >
        <DialogContent className="forge-modal">
          <DialogTitle>Turn an idea into a problem</DialogTitle>
          <DialogDescription>
            Paste a title, a book idea, a URL, or whatever you remember. Review
            the interpretation before adding it to your library.
          </DialogDescription>
          <label htmlFor="idea">What would you like to practice?</label>
          <textarea
            id="idea"
            className="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={6000}
            placeholder="I saw a problem about finding the minimum number of rooms for overlapping meetings…"
            disabled={!!busy}
          />
          <label className="check-label">
            <Checkbox
              checked={search}
              onCheckedChange={(v) => setSearch(!!v)}
              disabled={!!busy}
            />{' '}
            Research public web sources
          </label>
          <p className="muted">
            {search
              ? 'Uses Gemini + Tavily. Public sources help clarify the idea; premium text and official tests are not retrieved.'
              : 'Uses Gemini to create an original exercise from your idea, without web verification.'}
          </p>
          <button
            className="primary"
            disabled={!!busy || prompt.trim().length < 8}
            onClick={generate}
          >
            <Plus size={15} />
            {draft ? 'Regenerate problem' : 'Build practice problem'}
          </button>
          {draft && (
            <div className="draft-review">
              <h3>{draft.title}</h3>
              <span className="badge">
                {draft.difficulty} · {draft.tests.length} generated tests
              </span>
              <p className="preserve">{draft.statement}</p>
              <h3>Chosen assumptions</h3>
              <ul>
                {draft.assumptions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="muted">
                Verification checks both reference implementations against
                generated tests. Review the assumptions; this is not a proof of
                correctness.
              </p>
              <button
                className="primary"
                onClick={verifyAndSave}
                disabled={!!busy}
              >
                <Check size={15} /> Verify & add to library
              </button>
            </div>
          )}
          {busy && (
            <p className="status">
              <LoaderCircle size={15} className="spin" />
              {busy}
              <button onClick={() => controller.current?.abort()}>Stop</button>
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button onClick={() => setSettingsOpen(true)} className="text-button">
            Configure AI keys
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="forge-modal settings-modal">
          <DialogTitle>Research settings</DialogTitle>
          <DialogDescription>
            Practice and execution are free of server compute charges.
            Generating new problems needs provider keys. Use free-tier accounts;
            provider quotas and terms apply.
          </DialogDescription>
          <label htmlFor="gemini">
            Gemini API key{' '}
            {configured.gemini && (
              <span className="easy">· configured on server</span>
            )}
          </label>
          <input
            id="gemini"
            type="password"
            autoComplete="off"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="Gemini key"
          />
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Get a Gemini key <ExternalLink size={12} />
          </a>
          <label htmlFor="tavily">
            Tavily API key{' '}
            {configured.tavily && (
              <span className="easy">· configured on server</span>
            )}
          </label>
          <input
            id="tavily"
            type="password"
            autoComplete="off"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-…"
          />
          <a href="https://app.tavily.com" target="_blank" rel="noreferrer">
            Get a Tavily key <ExternalLink size={12} />
          </a>
          <p className="muted">
            Keys entered here stay in this page’s memory and are sent to the
            private backend only when needed. Reloading clears them. Prompts and
            code sent to the tutor are processed by Gemini; search prompts are
            sent to Tavily.
          </p>
          <div className="button-row">
            <button
              onClick={() => {
                setGeminiKey('');
                setTavilyKey('');
              }}
            >
              Clear session keys
            </button>
            <button className="primary" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Reset your solution?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces your current draft with the starter code. Saved
            submissions stay available.
          </AlertDialogDescription>
          <div className="button-row">
            <button onClick={() => setResetOpen(false)}>Keep draft</button>
            <button
              onClick={() => {
                updateCode(problem.starter[language]);
                setResetOpen(false);
              }}
            >
              Reset code
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
