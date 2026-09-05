import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Problem } from '../lib/problem';
const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const signIn = await fetch(base + '/signin-with-chatgpt?return_to=%2F', {
  redirect: 'manual',
});
const cookie = (signIn.headers.get('set-cookie') || '').split(';')[0];
await test('runner denies same-origin privileges and limits browser capabilities', async () => {
  const r = await fetch(base + '/api/runner');
  assert.equal(r.status, 200);
  const policy = r.headers.get('content-security-policy') || '';
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /frame-ancestors 'self'/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /worker-src blob:/);
});
await test('private API rejects forged cross-site mutations before writing', async () => {
  const r = await fetch(base + '/api/library', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      Origin: 'https://attacker.example',
    },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
await test('research rejects missing provider configuration or invalid payload', async () => {
  const r = await fetch(base + '/api/research', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      Origin: base,
    },
    body: JSON.stringify({ prompt: 'Find a pair of numbers', search: true }),
  });
  assert.equal(r.status, 428);
});

await test('signed-in library and submission round trip', async () => {
  const { seeds } = await import('../lib/seeds');
  const r = await fetch(base + '/api/library', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...seeds[0], title: 'API validation fixture' }),
  });
  assert.equal(r.status, 201);
  const { problem } = (await r.json()) as { problem: Problem };
  const library = (await (
    await fetch(base + '/api/library', { headers: { Cookie: cookie } })
  ).json()) as { problems: Problem[]; submissions: { verdict: string }[] };
  assert.ok(library.problems.some((p: Problem) => p.id === problem.id));
  const submit = await fetch(base + '/api/submissions', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      problemId: problem.id,
      language: 'python',
      code: problem.reference.python,
      verdict: 'Accepted',
      passed: 25,
      total: 25,
    }),
  });
  assert.equal(submit.status, 200);
  const history = (await (
    await fetch(base + '/api/submissions?problemId=' + problem.id, {
      headers: { Cookie: cookie },
    })
  ).json()) as { problems: Problem[]; submissions: { verdict: string }[] };
  assert.equal(history.submissions[0].verdict, 'Accepted');
  const anonymous = await fetch(base + '/api/library');
  assert.equal(anonymous.status, 401);
});
