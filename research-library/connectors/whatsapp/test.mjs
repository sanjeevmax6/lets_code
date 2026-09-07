import test from 'node:test';
import assert from 'node:assert/strict';
import { accepts, envelope } from './events.mjs';
import { resolveAdd } from './events.mjs';
import { selectGroup, settlePairing } from './session.mjs';
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

test('only authenticated owner commands in the selected group are accepted', async () => {
  const command = { ...sent, body: '!add https://example.org/paper' };
  assert.equal((await resolveAdd(command,'reading')).text,'https://example.org/paper');
  assert.equal(await resolveAdd({...command,fromMe:false,from:'reading'},'reading'),null);
  assert.equal(await resolveAdd(command,'other'),null);
  assert.equal(await resolveAdd({...command,body:'A normal https://example.org message'},'reading'),null);
  assert.equal(await resolveAdd({...command,body:'!addition https://example.org'},'reading'),null);
});

test('quoted links and PDFs retain the actual source and command comment', async () => {
  const source = {...sent,fromMe:false,from:'reading',body:'https://example.org/paper'};
  const command = {...sent,body:'!add important paper',hasQuotedMsg:true,getQuotedMessage:async()=>source};
  const result = await resolveAdd(command,'reading');
  assert.equal(result.source,source);
  assert.equal(result.comment,'important paper');
  assert.equal(result.text,source.body);
  const pdf = {...source,body:'',hasMedia:true};
  assert.equal((await resolveAdd({...command,getQuotedMessage:async()=>pdf},'reading')).source,pdf);
  await assert.rejects(resolveAdd({...command,getQuotedMessage:async()=>null},'reading'),/unavailable/);
  await assert.rejects(resolveAdd({...command,getQuotedMessage:async()=>({...source,from:'other'})},'reading'),/unavailable/);
  await assert.rejects(resolveAdd({...sent,body:'!add'},'reading'),/Reply !add/);
});

test('group selection rejects missing or ambiguous names', () => {
  const group={name:'Job to-do',isGroup:true,id:{_serialized:'group@g.us'}};
  assert.equal(selectGroup([group],'Job to-do'),'group@g.us');
  assert.throws(()=>selectGroup([],'Job to-do'),/found 0/);
  assert.throws(()=>selectGroup([group,group],'Job to-do'),/found 2/);
});

test('initial pairing settles while restored sessions continue immediately', async () => {
  const waits=[];
  await settlePairing(false,async ms=>waits.push(ms));
  assert.deepEqual(waits,[]);
  await settlePairing(true,async ms=>waits.push(ms));
  assert.deepEqual(waits,[60000]);
});
