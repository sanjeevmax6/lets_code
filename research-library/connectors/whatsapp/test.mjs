import test from 'node:test';
import assert from 'node:assert/strict';
import { accepts, envelope } from './events.mjs';
const sent = { fromMe: true, from: 'me', to: 'reading', timestamp: 1788703200, body: 'A link', id: { _serialized: 'stable' } };
test('accepts outgoing and incoming selected-chat messages only', () => {
  assert.equal(accepts(sent, 'reading'), true);
  assert.equal(accepts({ ...sent, fromMe: false, from: 'reading' }, 'reading'), true);
  assert.equal(accepts(sent, 'other'), false);
  assert.throws(() => envelope(sent, 'other'));
});
test('envelopes are replayable and edits preserve distinct revisions', () => {
  assert.deepEqual(envelope(sent, 'reading'), envelope(sent, 'reading'));
  assert.notEqual(envelope(sent, 'reading').source_id, envelope({ ...sent, body: 'Edited' }, 'reading').source_id);
});
