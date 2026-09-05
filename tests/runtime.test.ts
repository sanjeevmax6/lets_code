import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import { seeds } from '../lib/seeds';
import { equal, type Result } from '../lib/problem';
const source = await readFile(
  new URL('../public/runner-worker.js', import.meta.url),
  'utf8',
);
async function harness(language: string) {
  const messages: { type: string; results: Result[] }[] = [];
  const self: {
    postMessage: (m: unknown) => void;
    onmessage?: (event: { data: unknown }) => Promise<void>;
  } = {
    postMessage: (m) => messages.push(m as { type: string; results: Result[] }),
  };
  const context = vm.createContext({
    self,
    performance,
    structuredClone,
    importScripts: () => {},
    loadPyodide: () =>
      loadPyodide({
        indexURL: fileURLToPath(
          new URL('../node_modules/pyodide/', import.meta.url),
        ),
      }),
  });
  vm.runInContext(source, context);
  await self.onmessage!({ data: { type: 'init', language } });
  assert.equal(messages.pop()!.type, 'ready');
  return {
    async run(code: string, tests: unknown[]) {
      await self.onmessage!({ data: { type: 'run', language, code, tests } });
      return messages.pop()!.results;
    },
  };
}
for (const language of ['python', 'javascript'])
  await test(
    `${language}: production worker passes reference suites and reports code errors`,
    { timeout: 90000 },
    async () => {
      const worker = await harness(language);
      for (const p of seeds) {
        const results = await worker.run(
          p.reference[language as 'python' | 'javascript'],
          p.tests,
        );
        assert.equal(results.length, p.tests.length);
        results.forEach((r: Result, i: number) =>
          assert.ok(
            !r.error && equal(r.actual, p.tests[i].expected, p.comparison),
            p.title + ' ' + p.tests[i].label + ': ' + r.error,
          ),
        );
      }
      const code =
        language === 'python'
          ? 'def solve(x):\n    print("debug")\n    return x + 1'
          : 'function solve(x){console.log("debug");return x+1;}';
      const [r] = await worker.run(code, [
        { args: [1], expected: 2, label: 'debug' },
      ]);
      assert.equal(r.actual, 2);
      assert.match(r.stdout!, /debug/);
      const broken =
        language === 'python'
          ? 'def solve(x):\n    raise ValueError("test-error")'
          : 'function solve(x){throw new Error("test-error");}';
      const [err] = await worker.run(broken, [
        { args: [0], expected: 0, label: 'error' },
      ]);
      assert.match(err.error!, /test-error/);
      const invalid = language === 'python' ? 'def solve(' : 'function solve(';
      const [syntax] = await worker.run(invalid, [
        { args: [], expected: null, label: 'syntax' },
      ]);
      assert.ok(syntax.error);
    },
  );
