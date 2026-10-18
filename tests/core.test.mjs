import test from 'node:test';
import assert from 'node:assert/strict';
import {uid, makeInitialState, validateWorkflow, executeWorkflow, textStats, summarizeText, safeFilename} from '../lib/core.js';

const node = (id, kind = 'input', dependsOn = []) => ({id, title: id, kind, agentId: 'agent', dependsOn, required: true});
const workflow = (nodes) => ({id: 'workflow', title: 'Test workflow', nodes});
const docs = [{id: 'brief', title: '새벽', body: '비가 그친 새벽입니다. 라이더가 사진관에 도착합니다. 사진관의 문이 열립니다.'}];
const run = (flow, options = {}) => executeWorkflow(flow, {delayMs: 0, documents: docs, ...options});
const full = () => workflow([node('input'), node('extract', 'extract', ['input']), node('draft', 'draft', ['extract']), node('review', 'review', ['draft']), node('merge', 'merge', ['draft', 'review'])]);

test('uid uses a safe prefix and unique identities', () => {
  const ids = Array.from({length: 300}, () => uid('doc'));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith('doc_')));
  assert.match(uid('../unsafe/'), /^unsafe_/);
});

test('initial state has coherent references, Korean content and disconnected models', () => {
  const state = makeInitialState();
  assert.equal(state.version, 1);
  assert.equal(validateWorkflow(state.workflow).ok, true);
  assert.ok(state.documents.some((document) => /스토리보드/.test(document.title)));
  assert.ok(state.agents.every((agent) => agent.model === '미연결'));
  assert.ok(state.tasks.every((task) => state.documents.some((document) => document.id === task.documentId) && state.agents.some((agent) => agent.id === task.agentId)));
  assert.ok(state.documents.some((document) => document.id === state.activeDocumentId));
});

test('initial states are deeply independent', () => {
  const a = makeInitialState(); const b = makeInitialState();
  a.documents[0].notes[0].text = 'changed'; a.workflow.nodes[0].dependsOn.push('nope');
  assert.notEqual(b.documents[0].notes[0].text, 'changed');
  assert.deepEqual(b.workflow.nodes[0].dependsOn, []);
});

test('validator topologically sorts an out-of-order DAG stably', () => {
  const result = validateWorkflow(workflow([node('c', 'draft', ['a', 'b']), node('b'), node('a')]));
  assert.deepEqual(result, {ok: true, errors: [], order: ['b', 'a', 'c']});
});

test('validator rejects absent and empty node collections', () => {
  for (const input of [null, {}, {nodes: null}, workflow([])]) {
    const result = validateWorkflow(input); assert.equal(result.ok, false); assert.ok(result.errors.length); assert.deepEqual(result.order, []);
  }
});

test('validator rejects duplicates, invalid kinds, empty titles and invalid flags', () => {
  const bad = workflow([node('a'), {...node('a'), kind: 'pretend-ai', title: '', required: 'yes'}]);
  const result = validateWorkflow(bad);
  assert.equal(result.ok, false); assert.ok(result.errors.length >= 4);
});

test('validator rejects malformed nodes and dependencies without throwing', () => {
  for (const bad of [workflow([null]), workflow(['input']), workflow([{...node('a'), id: ''}]), workflow([{...node('a'), dependsOn: null}])]) {
    assert.equal(validateWorkflow(bad).ok, false);
  }
});

test('validator detects missing dependencies, self references and duplicate refs', () => {
  assert.equal(validateWorkflow(workflow([node('a', 'input', ['missing'])])).ok, false);
  assert.equal(validateWorkflow(workflow([node('a', 'input', ['a'])])).ok, false);
  assert.equal(validateWorkflow(workflow([node('a'), node('b', 'draft', ['a', 'a'])])).ok, false);
});

test('validator detects cycles and does not expose partial execution order', () => {
  const result = validateWorkflow(workflow([node('free'), node('a', 'draft', ['b']), node('b', 'review', ['a'])]));
  assert.equal(result.ok, false); assert.deepEqual(result.order, []); assert.match(result.errors.join(' '), /순환/);
});

test('merge cannot be configured without a prerequisite', () => {
  assert.equal(validateWorkflow(workflow([node('merge', 'merge')])).ok, false);
});

test('text stats handle empty input, Unicode, CRLF and paragraphs', () => {
  assert.deepEqual(textStats(''), {characters: 0, words: 0, lines: 0, paragraphs: 0, readingMinutes: 0});
  const stats = textStats('안녕 👋\r\n\r\n두 번째');
  assert.equal(stats.characters, 12); assert.equal(stats.words, 4); assert.equal(stats.lines, 3); assert.equal(stats.paragraphs, 2); assert.equal(stats.readingMinutes, 1);
  assert.equal(textStats('word '.repeat(441)).readingMinutes, 3);
});

test('summary is extractive, bounded and handles empty values', () => {
  assert.equal(summarizeText('하나입니다. 둘입니다. 셋입니다. 넷입니다.'), '하나입니다. 둘입니다. 셋입니다.');
  assert.equal(summarizeText(null), '문서 내용이 비어 있습니다.');
  assert.ok(Array.from(summarizeText('가'.repeat(1000))).length <= 360);
});

test('safeFilename handles paths, reserved names, Unicode and length', () => {
  for (const input of ['../../private:name?.md', '\0..', 'a\\b/c<>|*']) assert.doesNotMatch(safeFilename(input), /[/\\<>:"|?*\u0000]/);
  assert.equal(safeFilename(' .. '), 'document');
  assert.equal(safeFilename('CON.txt'), '_CON.txt');
  assert.equal(safeFilename(' 새벽의 배달 '), '새벽의 배달');
  assert.equal(Array.from(safeFilename('가'.repeat(300))).length, 96);
});

test('complete pipeline performs local transforms and accepts merge only at the end', async () => {
  const events = [];
  const result = await run(full(), {onStep: (step) => events.push({id: step.nodeId, status: step.status})});
  assert.equal(result.status, 'completed'); assert.equal(result.mode, 'local-demo');
  assert.ok(result.steps.every((step) => step.status === 'completed'));
  assert.match(result.output, /새벽/); assert.equal(result.steps.at(-1).data.accepted, true);
  assert.equal(result.steps.find((step) => step.kind === 'draft').data.generatedByAI, false);
  assert.deepEqual(events.filter((event) => event.status === 'running').map((event) => event.id), ['input', 'extract', 'draft', 'review', 'merge']);
  assert.ok(Date.parse(result.finishedAt) >= Date.parse(result.startedAt));
});

test('same documents and graph yield deterministic text and structured outputs', async () => {
  const a = await run(full()); const b = await run(full());
  assert.equal(a.output, b.output);
  assert.deepEqual(a.steps.map((step) => step.data), b.steps.map((step) => step.data));
});

test('invalid graph returns failed result and never executes callbacks', async () => {
  let calls = 0;
  const result = await run(workflow([node('a', 'draft', ['missing'])]), {onStep: () => calls++});
  assert.equal(result.status, 'failed'); assert.equal(calls, 0); assert.deepEqual(result.steps, []); assert.equal(result.output, '');
});

test('empty input fails draft and blocks its review and merge dependencies', async () => {
  const result = await run(full(), {documents: []});
  assert.equal(result.status, 'failed');
  assert.equal(result.steps.find((step) => step.nodeId === 'draft').status, 'failed');
  assert.equal(result.steps.find((step) => step.nodeId === 'review').status, 'blocked');
  assert.equal(result.steps.at(-1).status, 'blocked'); assert.equal(result.output, '');
});

test('review with no successful draft fails and cannot approve a merge', async () => {
  const result = await run(workflow([node('input'), node('review', 'review', ['input']), node('merge', 'merge', ['review'])]));
  assert.equal(result.steps[1].status, 'failed'); assert.equal(result.steps[1].data.passed, false);
  assert.equal(result.steps[2].status, 'blocked'); assert.equal(result.output, '');
});

test('failed optional prerequisites still block dependant merge', async () => {
  const flow = workflow([{...node('review', 'review'), required: false}, node('merge', 'merge', ['review'])]);
  const result = await run(flow);
  assert.equal(result.steps[0].status, 'failed'); assert.equal(result.steps[1].status, 'blocked'); assert.equal(result.output, '');
});

test('pre-aborted run cancels every step without executing output', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await run(full(), {signal: controller.signal});
  assert.equal(result.status, 'cancelled'); assert.ok(result.steps.every((step) => step.status === 'cancelled')); assert.equal(result.output, '');
});

test('abort during delay cancels current and future steps without an accepted artifact', async () => {
  const controller = new AbortController();
  const result = await run(full(), {signal: controller.signal, delayMs: 1000, onStep: (step) => { if (step.status === 'running') setTimeout(() => controller.abort(), 5); }});
  assert.equal(result.status, 'cancelled'); assert.equal(result.steps[0].status, 'cancelled'); assert.equal(result.steps.at(-1).data, null); assert.equal(result.output, '');
});

test('runner snapshots documents, graph and progress callbacks', async () => {
  const flow = full(); const inputs = structuredClone(docs);
  const result = await run(flow, {documents: inputs, onStep: (step, snapshot) => {
    inputs[0].body = 'MUTATED'; flow.nodes.at(-1).dependsOn.length = 0;
    step.status = 'failed'; snapshot.steps.length = 0;
  }});
  assert.equal(result.status, 'completed'); assert.doesNotMatch(result.output, /MUTATED/); assert.equal(result.steps.length, 5);
});

test('runner never calls fetch or an AI client', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected network call'); };
  try { assert.equal((await run(full())).status, 'completed'); }
  finally { globalThis.fetch = original; }
});

test('observer errors are contained and do not mislabel successful work', async () => {
  const result = await run(workflow([node('a')]), {onStep: () => { throw new Error('view unavailable'); }});
  assert.equal(result.status, 'completed'); assert.equal(result.warnings.length, 2); assert.deepEqual(result.errors, []);
});

test('sparse node collections fail validation instead of throwing', () => {
  assert.equal(validateWorkflow(workflow(new Array(2))).ok, false);
});

test('paragraph counts normalize bare carriage returns', () => {
  assert.equal(textStats('one\r\rtwo').paragraphs, 2);
});

test('review cannot use a successful draft from an unrelated branch', async () => {
  const result = await run(workflow([node('draft', 'draft'), node('review', 'review')]));
  assert.equal(result.steps[0].status, 'completed');
  assert.equal(result.steps[1].status, 'failed');
});

test('review can find a draft through its dependency ancestors', async () => {
  const result = await run(workflow([node('draft', 'draft'), node('middle', 'extract', ['draft']), node('review', 'review', ['middle'])]));
  assert.equal(result.status, 'completed');
  assert.equal(result.steps[2].data.passed, true);
});

test('failed workflow does not expose a previously merged artifact as final output', async () => {
  const result = await run(workflow([node('input'), node('merge', 'merge', ['input']), node('failed-review', 'review')]));
  assert.equal(result.steps[1].data.accepted, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.output, '');
});

test('Fibonacci merge DAG fails within byte budgets and blocks dependants', async () => {
  const nodes = [node('draft', 'draft'), node('review', 'review', ['draft']), node('m0', 'merge', ['draft', 'review'])];
  for (let i = 1; i <= 24; i++) nodes.push(node(`m${i}`, 'merge', i === 1 ? ['m0', 'draft'] : [`m${i - 1}`, `m${i - 2}`]));
  const result = await run(workflow(nodes), {documents: [{id: 'd', title: '장면', body: '장면 '.repeat(200)}]});
  assert.equal(result.status, 'failed'); assert.equal(result.output, '');
  assert.ok(result.steps.some((step) => step.status === 'failed' && /용량 한도/.test(step.error)));
  assert.ok(result.steps.some((step) => step.status === 'blocked'));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 80 * 1024);
  assert.ok(result.steps.every((step) => Buffer.byteLength(JSON.stringify({output: step.output, data: step.data})) <= 20 * 1024));
});

test('oversized documents fail before source concatenation and outline expansion', async () => {
  const result = await run(full(), {documents: [{id: 'd', title: '큰 원문', body: '가'.repeat(1_000_000)}]});
  assert.equal(result.status, 'failed'); assert.equal(result.output, '');
  assert.equal(result.steps[0].status, 'failed'); assert.match(result.steps[0].error, /용량 한도/);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 80 * 1024);
});

test('aggregate run budget limits many individually small parallel outputs', async () => {
  const sources = Array.from({length: 30}, (_, i) => ({id: `d${i}`, title: '장'.repeat(80), body: '메모'}));
  const result = await run(workflow(Array.from({length: 30}, (_, i) => node(`input${i}`))), {documents: sources});
  assert.equal(result.status, 'failed'); assert.equal(result.output, '');
  assert.ok(result.steps.some((step) => step.status === 'completed'));
  assert.ok(result.steps.some((step) => step.status === 'failed'));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 80 * 1024);
});
