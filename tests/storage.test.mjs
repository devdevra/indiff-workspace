import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  MAX_TEXT_BYTES,
  MAX_BACKUP_BYTES,
  validateState,
  serializeState,
  parseState,
  saveState,
  loadState,
  importTextFile,
} from '../lib/storage.js';

const DATE = '2026-10-17T10:00:00.000Z';

function state() {
  return {
    version: 1,
    documents: [{ id: 'doc-1', title: '첫 문서', body: '# 로컬 문서\n안녕하세요.', tags: ['초안'], updatedAt: DATE, notes: [{ id: 'note-1', text: '검토 필요', createdAt: DATE }] }],
    agents: [{ id: 'agent-1', name: '편집자', role: '문장 검토', instructions: '명확하게 정리합니다.', model: '미연결' }],
    tasks: [{ id: 'task-1', title: '문서 검토', agentId: 'agent-1', status: 'todo', documentId: 'doc-1' }],
    workflow: {
      id: 'workflow-1', title: '초안 흐름', nodes: [
        { id: 'node-1', title: '입력', kind: 'input', agentId: '', dependsOn: [], required: true },
        { id: 'node-2', title: '검토', kind: 'review', agentId: 'agent-1', dependsOn: ['node-1'], required: false },
      ],
    },
    runs: [{
      id: 'run-1', mode: 'local-demo', status: 'completed', startedAt: DATE, finishedAt: DATE,
      output: '로컬 시뮬레이션', errors: [], warnings: [], workflowTitle: '로컬 흐름',
      steps: [{ id: 'step-1', nodeId: 'node-1', title: '입력', kind: 'input', status: 'completed', output: '문서 1개', agentId: null, error: null, data: { count: 1 }, startedAt: DATE, finishedAt: DATE }],
    }],
    activeDocumentId: 'doc-1',
  };
}

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values,
  };
}

function file(name, content, options = {}) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    name,
    size: options.size ?? bytes.byteLength,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
  };
}

test('complete schema round-trips without mutation and supports Korean text', () => {
  const original = state();
  const before = structuredClone(original);
  assert.deepEqual(validateState(original), { ok: true, errors: [] });
  assert.deepEqual(parseState(serializeState(original)), original);
  assert.deepEqual(original, before);
});

test('empty collections and unassigned references are valid', () => {
  const value = { version: 1, documents: [], agents: [], tasks: [], workflow: { id: 'w', title: '', nodes: [] }, runs: [], activeDocumentId: null };
  assert.equal(validateState(value).ok, true);
  const assigned = state();
  assigned.tasks[0].agentId = null;
  assigned.tasks[0].documentId = '';
  assigned.workflow.nodes[1].agentId = null;
  assert.equal(validateState(assigned).ok, true);
});

test('missing storage uses fallback without writing', () => {
  const fallback = state();
  const storage = memoryStorage();
  assert.deepEqual(loadState(fallback, storage), { state: fallback, warning: null });
  assert.equal(storage.values.size, 0);
});

test('save and load use the exported key', () => {
  const storage = memoryStorage();
  const original = state();
  assert.equal(saveState(original, storage), undefined);
  assert.equal(storage.values.has(STORAGE_KEY), true);
  assert.deepEqual(loadState(null, storage), { state: original, warning: null });
});

test('damaged stored JSON preserves existing data and returns a warning', () => {
  const damaged = '{ "version":';
  const storage = memoryStorage(damaged);
  const fallback = state();
  const loaded = loadState(fallback, storage);
  assert.equal(loaded.state, fallback);
  assert.match(loaded.warning, /기존 저장 데이터는 유지/);
  assert.equal(storage.values.get(STORAGE_KEY), damaged);
});

test('unavailable storage and blocked reads produce Korean errors/warnings', () => {
  assert.throws(() => saveState(state(), null), /저장소에 접근할 수 없습니다/);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() {} };
  assert.equal(loadState('fallback', blocked).state, 'fallback');
  assert.ok(loadState('fallback', blocked).warning);
  const writeBlocked = { getItem() { return null; }, setItem() { throw new Error('blocked'); } };
  assert.throws(() => saveState(state(), writeBlocked), /저장하지 못했습니다/);
});

test('quota failures are distinguished and do not remove old data', () => {
  const storage = memoryStorage('old-value');
  storage.setItem = () => { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; };
  assert.throws(() => saveState(state(), storage), /저장 공간이 가득/);
  assert.equal(storage.values.get(STORAGE_KEY), 'old-value');
});

test('bad versions, unknown fields, missing fields and wrong field types are rejected', () => {
  const variants = [
    (value) => { value.version = 2; },
    (value) => { value.extra = true; },
    (value) => { delete value.documents[0].notes; },
    (value) => { value.documents[0].body = 12; },
    (value) => { value.documents[0].tags = 'tag'; },
    (value) => { value.agents[0].model = 'GPT'; },
    (value) => { value.workflow.nodes[0].required = 'true'; },
    (value) => { value.documents[0].updatedAt = 'not a date'; },
    (value) => { value.documents[0].notes[0].createdAt = 1; },
  ];
  for (const change of variants) {
    const value = state();
    change(value);
    assert.equal(validateState(value).ok, false);
    assert.throws(() => parseState(JSON.stringify(value)), /백업을 가져올 수 없습니다/);
  }
  for (const value of [null, [], 'text', 1]) assert.equal(validateState(value).ok, false);
});

test('duplicate IDs, dangling references, duplicate tags and unsupported node kinds fail', () => {
  const variants = [
    (value) => { value.documents.push(structuredClone(value.documents[0])); },
    (value) => { value.documents[0].notes.push(structuredClone(value.documents[0].notes[0])); },
    (value) => { value.activeDocumentId = 'missing'; },
    (value) => { value.tasks[0].agentId = 'missing'; },
    (value) => { value.tasks[0].documentId = 'missing'; },
    (value) => { value.workflow.nodes[1].agentId = 'missing'; },
    (value) => { value.documents[0].tags.push('초안'); },
    (value) => { value.workflow.nodes[0].kind = 'execute'; },
  ];
  for (const change of variants) {
    const value = state(); change(value);
    assert.equal(validateState(value).ok, false);
  }
});

test('workflow dependencies reject unknown, duplicate, self and cyclic links', () => {
  for (const dependencies of [['missing'], ['node-1', 'node-1'], ['node-2']]) {
    const value = state();
    value.workflow.nodes[1].dependsOn = dependencies;
    assert.equal(validateState(value).ok, false);
  }
  const cyclic = state();
  cyclic.workflow.nodes[0].dependsOn = ['node-2'];
  assert.equal(validateState(cyclic).ok, false);
});

test('collection, string and backup byte limits are enforced', () => {
  const tooMany = state();
  tooMany.runs = Array.from({ length: 31 }, (_, index) => ({ id: `r${index}` }));
  assert.equal(validateState(tooMany).ok, false);
  const longTitle = state();
  longTitle.documents[0].title = 'x'.repeat(241);
  assert.equal(validateState(longTitle).ok, false);
  const tooManyDocs = state();
  tooManyDocs.documents = Array.from({ length: 201 }, (_, index) => ({ ...tooManyDocs.documents[0], id: `d${index}` }));
  assert.equal(validateState(tooManyDocs).ok, false);
  assert.throws(() => parseState(' '.repeat(MAX_BACKUP_BYTES + 1)), /최대 5MB/);
  const multibyte = state();
  multibyte.documents = Array.from({ length: 2 }, (_, index) => ({ ...multibyte.documents[0], id: `d${index}`, body: '한'.repeat(900_000) }));
  multibyte.activeDocumentId = 'd0'; multibyte.tasks[0].documentId = 'd0';
  assert.equal(validateState(multibyte).ok, false);
  assert.throws(() => serializeState(multibyte), /5MB/);
});

test('run snapshots reject invalid JSON, excessive depth/size, unsafe keys and repeated IDs', () => {
  const variants = [
    (value) => { value.runs = [null]; },
    (value) => { value.runs[0].invalid = Infinity; },
    (value) => { value.runs[0].invalid = undefined; },
    (value) => { value.runs[0].invalid = () => {}; },
    (value) => { value.runs[0].circular = value.runs[0]; },
    (value) => { value.runs[0].deep = Array.from({ length: 15 }).reduce((result) => ({ next: result }), {}); },
    (value) => { value.runs[0].unsafe = JSON.parse('{"__proto__":{"polluted":true}}'); },
    (value) => { value.runs[0].large = ['x'.repeat(100_000), 'x'.repeat(100_000), 'x'.repeat(100_000)]; },
    (value) => { value.runs.push(structuredClone(value.runs[0])); },
  ];
  for (const change of variants) {
    const value = state(); change(value);
    assert.equal(validateState(value).ok, false);
  }
  assert.equal({}.polluted, undefined);
});

test('run records require the complete terminal local-demo shape', () => {
  for (const field of ['id', 'mode', 'status', 'steps', 'output', 'startedAt', 'finishedAt', 'errors']) {
    const value = state(); delete value.runs[0][field];
    assert.equal(validateState(value).ok, false, `missing ${field}`);
  }
  const variants = [
    (value) => { value.runs = [{}]; },
    (value) => { value.runs[0].mode = 'remote-ai'; },
    (value) => { value.runs[0].status = 'running'; },
    (value) => { value.runs[0].status = 'pending'; },
    (value) => { value.runs[0].steps = {}; },
    (value) => { value.runs[0].steps = []; },
    (value) => { value.runs[0].output = 1; },
    (value) => { value.runs[0].startedAt = null; },
    (value) => { value.runs[0].finishedAt = null; },
    (value) => { value.runs[0].startedAt = '2026-10-17'; },
    (value) => { value.runs[0].finishedAt = '2026-02-30T10:00:00.000Z'; },
    (value) => { value.runs[0].errors = ['error', 12]; },
    (value) => { value.runs[0].warnings = 'warning'; },
    (value) => { value.runs[0].workflowTitle = {}; },
  ];
  for (const change of variants) {
    const value = state(); change(value);
    assert.equal(validateState(value).ok, false);
    assert.throws(() => parseState(JSON.stringify(value)), /백업을 가져올 수 없습니다/);
  }
});

test('run steps reject missing essentials and malformed core metadata', () => {
  for (const field of ['nodeId', 'title', 'kind', 'status', 'output']) {
    const value = state(); delete value.runs[0].steps[0][field];
    assert.equal(validateState(value).ok, false, `missing step ${field}`);
  }
  const variants = [
    (step) => { step.nodeId = null; },
    (step) => { step.title = {}; },
    (step) => { step.kind = 'network'; },
    (step) => { step.status = 'running'; },
    (step) => { step.status = 'pending'; },
    (step) => { step.output = false; },
    (step) => { step.id = 4; },
    (step) => { step.agentId = []; },
    (step) => { step.error = {}; },
    (step) => { step.startedAt = 123; },
    (step) => { step.finishedAt = null; },
    (step) => { step.data = new Date(); },
  ];
  for (const change of variants) {
    const value = state(); change(value.runs[0].steps[0]);
    assert.equal(validateState(value).ok, false);
  }
  const duplicate = state();
  duplicate.runs[0].steps.push(structuredClone(duplicate.runs[0].steps[0]));
  assert.equal(validateState(duplicate).ok, false);
});

test('failed/cancelled runs preserve terminal steps that never started', () => {
  for (const status of ['failed', 'cancelled']) {
    const value = state();
    value.runs[0].status = status;
    value.runs[0].steps[0].status = status === 'failed' ? 'blocked' : 'cancelled';
    value.runs[0].steps[0].startedAt = null;
    value.runs[0].steps[0].error = '선행 단계 미완료';
    assert.equal(validateState(value).ok, true);
  }
  const failedBeforeStarting = state();
  failedBeforeStarting.runs[0].status = 'failed';
  failedBeforeStarting.runs[0].steps = [];
  assert.equal(validateState(failedBeforeStarting).ok, true);
});

test('actual local core execution produces a persistable terminal run', async () => {
  const { makeInitialState, executeWorkflow } = await import('../lib/core.js');
  const value = makeInitialState();
  value.runs.push(await executeWorkflow(value.workflow, { documents: value.documents, delayMs: 0 }));
  const validation = validateState(value);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.deepEqual(parseState(serializeState(value)), value);
});

test('sparse arrays and non-plain object values are rejected', () => {
  const sparse = state(); sparse.documents = new Array(2);
  assert.equal(validateState(sparse).ok, false);
  const object = state(); object.documents[0] = new Date();
  assert.equal(validateState(object).ok, false);
});

test('parse rejects invalid JSON/nontext input and supports a UTF-8 BOM', () => {
  assert.throws(() => parseState('{broken'), /JSON을 읽을 수 없습니다/);
  assert.throws(() => parseState(new Uint8Array()), /JSON 텍스트/);
  assert.deepEqual(parseState(`\uFEFF${serializeState(state())}`), state());
});

test('text imports support .txt/.md/.markdown, Unicode, BOM and plain text HTML', async () => {
  for (const name of ['문서.txt', '문서.MD', '문서.markdown']) {
    const content = '\uFEFF# 안녕하세요\r\n\t<script>alert(1)</script>';
    assert.deepEqual(await importTextFile(file(name, content)), { title: '문서', body: content.slice(1) });
  }
  assert.deepEqual(await importTextFile(file('.txt', '')), { title: '가져온 문서', body: '' });
});

test('text imports reject unsupported extensions and oversized files before reading', async () => {
  for (const name of ['report.pdf', 'photo.png', 'readme', 'doc.txt.exe']) {
    await assert.rejects(importTextFile(file(name, 'data')), /텍스트 파일만/);
  }
  let read = false;
  await assert.rejects(importTextFile({ name: 'large.txt', size: MAX_TEXT_BYTES + 1, async arrayBuffer() { read = true; } }), /최대 1MB/);
  assert.equal(read, false);
  await assert.rejects(importTextFile(file('lying.txt', 'abc', { size: 1 })), /파일 크기/);
});

test('text imports reject NUL, binary controls, invalid UTF-8 and read failures', async () => {
  for (const content of ['a\u0000b', '\u0001binary', '\u007f']) {
    await assert.rejects(importTextFile(file('binary.txt', content)), /바이너리/);
  }
  await assert.rejects(importTextFile(file('legacy.txt', new Uint8Array([0xc3, 0x28]))), /UTF-8/);
  await assert.rejects(importTextFile({ name: 'broken.md', size: 2, async arrayBuffer() { throw new Error('missing'); } }), /파일을 읽지 못/);
});

test('a text file at the exact byte limit is accepted', async () => {
  const imported = await importTextFile(file('limit.txt', 'x'.repeat(MAX_TEXT_BYTES)));
  assert.equal(imported.body.length, MAX_TEXT_BYTES);
});
