import { equal, type Language, type TestCase, type Result } from './problem';
export async function runCode(
  code: string,
  language: Language,
  tests: TestCase[],
  comparison: string,
  signal?: AbortSignal,
): Promise<Result[]> {
  if (code.length > 30000)
    throw new Error('Code is limited to 30,000 characters.');
  if (tests.length > 80) throw new Error('At most 80 cases per run.');
  const response = await fetch('/runner-worker.js', { signal });
  if (!response.ok) throw new Error('Runner unavailable.');
  const workerSource = await response.text();
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.sandbox.add('allow-scripts');
    frame.src = '/api/runner';
    frame.hidden = true;
    frame.title = 'Isolated code runner';
    const channel = new MessageChannel();
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    let phase: 'connecting' | 'loading' | 'running' = 'connecting';
    const cleanup = () => {
      clearTimeout(timer);
      channel.port1.close();
      frame.remove();
      signal?.removeEventListener('abort', abort);
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    };
    const abort = () => fail('Execution stopped.');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    const timeout = (ms: number, message: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => fail(message), ms);
    };
    channel.port1.onmessage = ({ data }) => {
      if (finished) return;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'connected' && phase === 'connecting') {
        phase = 'loading';
        channel.port1.postMessage({ type: 'init', language, workerSource });
      }
      if (data.type === 'ready' && phase === 'loading') {
        phase = 'running';
        timeout(5000, 'Time limit exceeded (5 seconds for the test batch).');
        channel.port1.postMessage({ type: 'run', language, code, tests });
      }
      if (data.type === 'error')
        fail(
          typeof data.error === 'string'
            ? data.error.slice(0, 4000)
            : 'Runner failed.',
        );
      if (data.type === 'result' && phase === 'running') {
        if (
          !Array.isArray(data.results) ||
          data.results.length !== tests.length
        ) {
          fail('Invalid runner response.');
          return;
        }
        try {
          const output = data.results.map((r: Result, i: number) => {
            if (
              !r ||
              typeof r !== 'object' ||
              !Number.isFinite(r.duration) ||
              r.duration < 0 ||
              (r.error !== undefined && typeof r.error !== 'string') ||
              (r.stdout !== undefined && typeof r.stdout !== 'string')
            )
              throw new Error('Invalid result');
            return {
              label: tests[i].label,
              actual: r.actual,
              duration: r.duration,
              error: r.error?.slice(0, 4000),
              stdout: r.stdout?.slice(0, 4000),
              expected: tests[i].expected,
              passed:
                !r.error && equal(r.actual, tests[i].expected, comparison),
            };
          });
          finished = true;
          cleanup();
          resolve(output);
        } catch {
          fail('Invalid runner response.');
        }
      }
    };
    frame.onload = () =>
      frame.contentWindow?.postMessage({ type: 'connect' }, '*', [
        channel.port2,
      ]);
    document.body.appendChild(frame);
    timeout(
      60000,
      'Python runtime download timed out. Check your connection and retry.',
    );
  });
}
