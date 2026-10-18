import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { APP_URL, METHODS, MAX_TEXT_BYTES, MAX_WORKSPACE_BYTES, HostError, trustedDocument, trustedSender, assetForURL, encodeSnapshot, validateText, suggestedName, readBounded, atomicWrite, createHostController } from '../platforms/windows/host-core.mjs';

const snapshot = name => ({ format: 'indiff.platform-workspace', version: 1, workspace: { documents: [{ id: name, body: '한글 🌍' }] }, ui: { pane: name } });
async function fixture(t, dialogs = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indiff-host-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const workspacePath = path.join(dir, 'private', 'workspace-v1.json');
  const host = createHostController({ workspacePath, dialogs: { pick: async () => null, saveAs: async () => null, ...dialogs } });
  const owner = host.addOwner();
  return { dir, workspacePath, host, owner, invoke: (method, payload = {}) => host.invoke(method, payload, owner) };
}
const expectError = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); return result; };

test('Windows origin accepts only exact local app main document', () => {
  assert.equal(trustedDocument(APP_URL), true);
  assert.equal(trustedDocument('indiff-app://workspace/#panes'), true);
  for (const value of ['https://workspace/index.html', 'indiff-app://workspace.attacker/index.html', 'indiff-app://workspace:23/index.html', 'indiff-app://user@workspace/index.html', 'indiff-app://workspace/app.js', 'indiff-app://workspace/index.html?x=1', 'file:///index.html', 'not a url']) assert.equal(trustedDocument(value), false, value);
});

test('Windows IPC validates webContents identity, top frame and both document URLs', () => {
  const frame = { url: APP_URL }, contents = { mainFrame: frame, isDestroyed: () => false, getURL: () => APP_URL };
  assert.equal(trustedSender({ sender: contents, senderFrame: frame }, contents), true);
  assert.equal(trustedSender({ sender: contents, senderFrame: { url: APP_URL } }, contents), false);
  assert.equal(trustedSender({ sender: {}, senderFrame: frame }, contents), false);
  frame.url = 'https://attacker.invalid';
  assert.equal(trustedSender({ sender: contents, senderFrame: frame }, contents), false);
});

test('Windows protocol resolves only packaged asset names and rejects traversal/remote/path leakage', () => {
  const names = new Set(['index.html', 'app.js', 'lib/host.js']);
  assert.equal(assetForURL('indiff-app://workspace/', names), 'index.html');
  assert.equal(assetForURL('indiff-app://workspace/lib/host.js', names), 'lib/host.js');
  for (const url of ['indiff-app://workspace/../index.html', 'indiff-app://workspace/%2e%2e/index.html', 'indiff-app://workspace/lib%2fhost.js', 'indiff-app://workspace/%5csecret', 'indiff-app://workspace/main.mjs', 'indiff-app://other/index.html', 'https://workspace/index.html', 'indiff-app://workspace/app.js?remote=1']) assert.equal(assetForURL(url, names), null, url);
});

test('Windows snapshot validates envelope, plain JSON, reserved keys, depth and byte limits', () => {
  assert.deepEqual(JSON.parse(encodeSnapshot(snapshot('one'))), snapshot('one'));
  for (const value of [null, [], { ...snapshot('a'), format: 'other' }, { ...snapshot('a'), version: 2 }, { ...snapshot('a'), ui: [] }, { ...snapshot('a'), path: '/etc' }]) assert.throws(() => encodeSnapshot(value), { code: 'INVALID_SNAPSHOT' });
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: new Date() }), { code: 'INVALID_SNAPSHOT' });
  const cycle = {}; cycle.x = cycle;
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: cycle }), { code: 'INVALID_DATA' });
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: JSON.parse('{"__proto__":{}}') }), { code: 'INVALID_DATA' });
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: { value: Infinity } }), { code: 'INVALID_DATA' });
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: { text: '한'.repeat(Math.floor(MAX_WORKSPACE_BYTES / 3)) } }), { code: 'TOO_LARGE' });
  let deep = {}; for (let i = 0; i < 65; i++) deep = { nested: deep };
  assert.throws(() => encodeSnapshot({ ...snapshot('a'), ui: deep }), { code: 'INVALID_DATA' });
});

test('Windows text and workspace backup validation is byte-bounded and Unicode-safe', () => {
  assert.equal(validateText('한글'), 6);
  assert.equal(validateText('x'.repeat(MAX_TEXT_BYTES)), MAX_TEXT_BYTES);
  assert.throws(() => validateText('x'.repeat(MAX_TEXT_BYTES + 1)), { code: 'TOO_LARGE' });
  assert.throws(() => validateText('\u0000'), { code: 'INVALID_TEXT' });
  assert.throws(() => validateText('\ud800'), { code: 'INVALID_TEXT' });
  assert.throws(() => validateText('{}', 'executable'), { code: 'INVALID_REQUEST' });
  for (const value of ['[]', 'null', 'bad json']) assert.throws(() => validateText(value, 'workspace'), { code: 'INVALID_DATA' });
  for (const format of ['indiff-ui-correction', 'indiff.platform-workspace']) assert.equal(validateText(JSON.stringify({ format, version: 1, workspace: {}, ui: {} }), 'workspace') > 0, true);
});

test('Windows suggested names never contain paths or reserved device names', () => {
  assert.equal(suggestedName('CON.txt'), 'document.md');
  assert.equal(suggestedName('../../evil.ps1'), '.._.._evil.ps1.md');
  assert.equal(suggestedName('backup', 'workspace'), 'backup.json');
  assert.equal(suggestedName('run.json'), 'run.json');
});

test('Windows host exposes disconnected capabilities and rejects unsupported/path payloads', async t => {
  const { invoke } = await fixture(t);
  const info = await invoke('host.info'); assert.equal(info.ok, true); assert.equal(info.value.platform, 'windows'); assert.deepEqual(info.value.capabilities, METHODS);
  const connection = await invoke('host.connection'); assert.equal(connection.value.connected, false); assert.equal(connection.value.ai, false);
  for (const method of ['process.exec', 'ai.run', 'file.read', 'terminal.spawn']) expectError(await invoke(method), 'UNSUPPORTED');
  expectError(await invoke('file.pick', { path: '/etc/passwd' }), 'INVALID_REQUEST');
  expectError(await invoke('workspace.load', { path: '/etc/passwd' }), 'INVALID_REQUEST');
});

test('Windows workspace load/save round-trips a complete snapshot and serializes writes', async t => {
  const { invoke, workspacePath } = await fixture(t);
  assert.deepEqual(await invoke('workspace.load'), { ok: true, value: { snapshot: null } });
  const results = await Promise.all(['one', 'two', 'three'].map(name => invoke('workspace.save', { snapshot: snapshot(name) })));
  assert.equal(results.every(r => r.ok && r.value.saved), true);
  assert.deepEqual((await invoke('workspace.load')).value.snapshot, snapshot('three'));
  assert.deepEqual(JSON.parse(await fs.readFile(workspacePath, 'utf8')), snapshot('three'));
  assert.deepEqual((await fs.readdir(path.dirname(workspacePath))).sort(), ['workspace-v1.json']);
});

test('Windows malformed saved workspace is preserved instead of silently reset', async t => {
  const { invoke, workspacePath } = await fixture(t);
  await fs.mkdir(path.dirname(workspacePath)); await fs.writeFile(workspacePath, '{damaged');
  expectError(await invoke('workspace.load'), 'CORRUPT_WORKSPACE');
  assert.equal(await fs.readFile(workspacePath, 'utf8'), '{damaged');
  expectError(await invoke('workspace.save', { snapshot: [] }), 'INVALID_SNAPSHOT');
  assert.equal(await fs.readFile(workspacePath, 'utf8'), '{damaged');
});

test('Windows atomic failure before rename keeps prior bytes and removes temporary file', async t => {
  const { dir } = await fixture(t); const file = path.join(dir, 'old.md'); await fs.writeFile(file, 'old');
  await assert.rejects(atomicWrite(file, 'new', async () => { throw new HostError('CANCELED', 'Canceled'); }), { code: 'CANCELED' });
  assert.equal(await fs.readFile(file, 'utf8'), 'old');
  assert.deepEqual(await fs.readdir(dir), ['old.md']);
});

test('Windows picker cancellation is successful cancellation without side effects', async t => {
  const { invoke, dir } = await fixture(t);
  assert.deepEqual(await invoke('file.pick'), { ok: true, value: { canceled: true } });
  assert.deepEqual(await invoke('file.saveAs', { name: 'x.md', text: 'new' }), { ok: true, value: { canceled: true } });
  assert.deepEqual(await fs.readdir(dir), []);
});

test('Windows picker returns opaque handles, bounded text and basename only', async t => {
  let selected; const { invoke, dir } = await fixture(t, { pick: async () => selected });
  selected = path.join(dir, 'test.md'); await fs.writeFile(selected, '\uFEFFhello 한글');
  const result = await invoke('file.pick', { kind: 'text' });
  assert.equal(result.ok, true); assert.equal(result.value.name, 'test.md'); assert.equal(result.value.text, '\uFEFFhello 한글');
  assert.match(result.value.handle, /^[a-f0-9-]{36}$/);
  assert.equal(JSON.stringify(result).includes(dir), false);
  assert.equal((await invoke('file.save', { handle: result.value.handle, text: 'edited' })).ok, true);
  assert.equal(await fs.readFile(selected, 'utf8'), 'edited');
});

test('Windows save rejects forged paths and handles belonging to another document', async t => {
  let selected; const { invoke, host, dir } = await fixture(t, { pick: async () => selected });
  selected = path.join(dir, 'test.txt'); await fs.writeFile(selected, 'safe');
  const opened = (await invoke('file.pick')).value;
  expectError(await invoke('file.save', { handle: selected, text: 'danger' }), 'INVALID_HANDLE');
  expectError(await invoke('file.save', { handle: opened.handle, text: 'danger', path: selected }), 'INVALID_REQUEST');
  expectError(await host.invoke('file.save', { handle: opened.handle, text: 'danger' }, host.addOwner()), 'INVALID_HANDLE');
  assert.equal(await fs.readFile(selected, 'utf8'), 'safe');
});

test('Windows file save detects external changes and preserves them', async t => {
  let selected; const { invoke, dir } = await fixture(t, { pick: async () => selected });
  selected = path.join(dir, 'test.md'); await fs.writeFile(selected, 'first');
  const { handle } = (await invoke('file.pick')).value; await fs.writeFile(selected, 'external');
  expectError(await invoke('file.save', { handle, text: 'my edit' }), 'CONFLICT');
  assert.equal(await fs.readFile(selected, 'utf8'), 'external');
  await fs.unlink(selected);
  expectError(await invoke('file.save', { handle, text: 'my edit' }), 'CONFLICT');
});

test('Windows handles are revoked on reload and pending dialogs do not write after closing', async t => {
  let finish, selected; const { invoke, host, owner, dir } = await fixture(t, { saveAs: () => new Promise(resolve => { finish = resolve; }) });
  selected = path.join(dir, 'never.md');
  const pending = invoke('file.saveAs', { text: 'never', name: 'never.md' });
  await new Promise(resolve => setImmediate(resolve)); host.revokeOwner(owner); finish(selected);
  expectError(await pending, 'CANCELED');
  await assert.rejects(fs.access(selected), { code: 'ENOENT' });
  expectError(await invoke('host.info'), 'CANCELED');
});

test('Windows repeated native dialog requests return BUSY without extra dialogs', async t => {
  let finish, count = 0; const { invoke } = await fixture(t, { pick: () => { count++; return new Promise(resolve => { finish = resolve; }); } });
  const pending = invoke('file.pick'); await new Promise(resolve => setImmediate(resolve));
  expectError(await invoke('file.pick'), 'BUSY'); assert.equal(count, 1); finish(null);
  assert.deepEqual(await pending, { ok: true, value: { canceled: true } });
});

test('Windows saveAs creates a text file then permits handle-only atomic saves', async t => {
  let selected, options; const { invoke, dir } = await fixture(t, { saveAs: async value => { options = value; return selected; } });
  selected = path.join(dir, 'new.txt');
  const result = await invoke('file.saveAs', { text: 'first', name: 'new.txt' });
  assert.equal(result.ok, true); assert.deepEqual(options, { name: 'new.txt', kind: 'text' });
  assert.equal(result.value.bytes, 5); assert.equal(result.value.name, 'new.txt');
  assert.equal((await invoke('file.save', { text: 'next', handle: result.value.handle })).ok, true);
  assert.equal(await fs.readFile(selected, 'utf8'), 'next');
});

test('Windows workspace backup import/export allows UI backups over the text limit', async t => {
  let selected; const { invoke, dir } = await fixture(t, { saveAs: async () => selected, pick: async () => selected });
  selected = path.join(dir, 'backup.json');
  const text = JSON.stringify({ format: 'indiff-ui-correction', version: 1, workspace: { text: 'x'.repeat(MAX_TEXT_BYTES + 1) }, ui: {} });
  assert.equal((await invoke('file.saveAs', { kind: 'workspace', name: 'backup.json', text })).ok, true);
  const picked = await invoke('file.pick', { kind: 'workspace' }); assert.equal(picked.ok, true); assert.equal(picked.value.text, text);
  expectError(await invoke('file.pick', { kind: 'text' }), 'TOO_LARGE');
  expectError(await invoke('file.saveAs', { kind: 'workspace', text: '[]' }), 'INVALID_DATA');
});

test('Windows picker rejects unsupported extensions, malformed UTF-8 and non-JSON backups', async t => {
  let selected; const { invoke, dir } = await fixture(t, { pick: async () => selected });
  selected = path.join(dir, 'do-not-open.exe'); await fs.writeFile(selected, 'content');
  expectError(await invoke('file.pick'), 'UNSAFE_FILE');
  selected = path.join(dir, 'broken.md'); await fs.writeFile(selected, Buffer.from([0xc3, 0x28]));
  expectError(await invoke('file.pick'), 'INVALID_TEXT');
  selected = path.join(dir, 'backup.json'); await fs.writeFile(selected, '[]');
  expectError(await invoke('file.pick', { kind: 'workspace' }), 'INVALID_DATA');
});

test('Windows host refuses symlinks and directories without following their targets', async t => {
  let selected; const { invoke, dir } = await fixture(t, { pick: async () => selected, saveAs: async () => selected });
  const target = path.join(dir, 'safe.md'); await fs.writeFile(target, 'safe'); selected = path.join(dir, 'link.md');
  try { await fs.symlink(target, selected); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Symbolic links unavailable in this environment'); return; } throw error; }
  expectError(await invoke('file.pick'), 'UNSAFE_FILE'); expectError(await invoke('file.saveAs', { text: 'unsafe' }), 'UNSAFE_FILE');
  assert.equal(await fs.readFile(target, 'utf8'), 'safe');
  selected = path.join(dir, 'folder.md'); await fs.mkdir(selected); expectError(await invoke('file.pick'), 'UNSAFE_FILE');
});

test('Windows read is bounded and host errors omit private absolute paths', async t => {
  const { dir, invoke } = await fixture(t, { pick: async () => { throw Error('/private/user/secret/name'); } });
  const file = path.join(dir, 'large.txt'); await fs.writeFile(file, '12345');
  await assert.rejects(readBounded(file, 4), { code: 'TOO_LARGE' });
  const result = expectError(await invoke('file.pick'), 'IO_ERROR'); assert.equal(JSON.stringify(result).includes('/private'), false);
});

test('Windows main/preload/config static guards do not expose execution or remote navigation', async () => {
  const main = await fs.readFile(new URL('../platforms/windows/main.mjs', import.meta.url), 'utf8');
  const preload = await fs.readFile(new URL('../platforms/windows/preload.cjs', import.meta.url), 'utf8');
  const pkg = JSON.parse(await fs.readFile(new URL('../platforms/windows/package.json', import.meta.url), 'utf8'));
  const config = JSON.parse(await fs.readFile(new URL('../platforms/windows/electron-builder.json', import.meta.url), 'utf8'));
  for (const pattern of [/sandbox: true/, /contextIsolation: true/, /nodeIntegration: false/, /setPermissionRequestHandler/, /setWindowOpenHandler/, /trustedSender/, /will-frame-navigate/, /will-download/]) assert.match(main, pattern);
  assert.doesNotMatch(main + preload, /child_process|shell\.openExternal|executeJavaScript|nodeIntegration: true|contextIsolation: false|sandbox: false/);
  assert.equal((preload.match(/require\(/g) || []).length, 1); assert.match(preload, /require\('electron'\)/);
  assert.equal(pkg.devDependencies.electron, '44.9.0'); assert.equal(pkg.devDependencies['electron-builder'], '26.17.0');
  assert.equal(config.publish, null); assert.equal(config.npmRebuild, false); assert.equal(config.nsis.runAfterFinish, false); assert.equal(config.nsis.allowElevation, false); assert.equal(config.win.signExecutable, false); assert.equal(config.nsis.packElevateHelper, false);
});
