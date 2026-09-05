import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equal, ProblemSchema } from '../lib/problem';
import { seeds } from '../lib/seeds';
await test('judge preserves types, multiplicity and nested order', () => {
  assert.equal(equal(false, 0, 'exact'), false);
  assert.equal(equal([1, 1], [1, 2], 'unordered'), false);
  assert.equal(equal([1, 0], [0, 1], 'unordered'), true);
  assert.equal(equal([[1, 2]], [[2, 1]], 'unordered'), false);
  assert.equal(equal({ a: 1, b: 2 }, { b: 2, a: 1 }, 'exact'), true);
});
await test('starter problem contracts validate', () => {
  for (const p of seeds) ProblemSchema.parse(p);
});
await test('invalid contracts are rejected', () => {
  assert.equal(
    ProblemSchema.safeParse({ ...seeds[0], parameters: [] }).success,
    false,
  );
  assert.equal(
    ProblemSchema.safeParse({
      ...seeds[0],
      sources: [{ title: 'bad', url: 'javascript:alert(1)' }],
    }).success,
    false,
  );
});
