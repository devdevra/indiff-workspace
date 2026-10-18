/** Independent, dependency-free host boundary. Never import Electron here. */
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const APP_URL = 'indiff-app://workspace/index.html';
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 7 * 1024 * 1024;
export const METHODS = Object.freeze(['host.info', 'host.connection', 'workspace.load', 'workspace.save', 'file.pick', 'file.save', 'file.saveAs']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export class HostError extends Error {
  constructor(code, message) { super(message); this.name = 'HostError'; this.code = code; }
}
const fail = (code, message) => { throw new HostError(code, message); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function errorEnvelope(error) {
  // OS exception strings include private absolute paths. Never expose them.
  return { ok: false, error: error instanceof HostError ? { code: error.code, message: error.message } : { code: 'IO_ERROR', message: 'The local file operation failed. No successful save is confirmed.' } };
}

export function trustedDocument(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'indiff-app:' && url.hostname === 'workspace' && !url.port && !url.username && !url.password && !url.search && ['/index.html', '/'].includes(url.pathname);
  } catch { return false; }
}

export function trustedSender(event, contents) {
  try {
    return Boolean(contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame && trustedDocument(event.senderFrame.url) && trustedDocument(contents.getURL()));
  } catch { return false; }
}

export function assetForURL(raw, names) {
  try {
    if (typeof raw !== 'string' || /%(?:2e|2f|5c|00)|(?:^|\/)\.\.(?:\/|$)/i.test(raw)) return null;
    const url = new URL(raw);
    if (url.protocol !== 'indiff-app:' || url.hostname !== 'workspace' || url.port || url.username || url.password || url.search || url.hash) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (/[\\\0]/.test(decoded) || decoded.includes('%') || decoded.split('/').some(s => s === '.' || s === '..')) return null;
    const name = decoded === '/' ? 'index.html' : decoded.slice(1);
    return names.has(name) ? name : null;
  } catch { return null; }
}

function inspectJSON(value, maxBytes) {
  const pending = [{ value, depth: 0 }], seen = new Set(); let count = 0;
  while (pending.length) {
    const item = pending.pop(), node = item.value;
    if (++count > 200_000 || item.depth > 64) fail('INVALID_DATA', 'JSON structure exceeds the supported complexity.');
    if (node === null || typeof node === 'string' || typeof node === 'boolean') continue;
    if (typeof node === 'number' && Number.isFinite(node)) continue;
    if (!Array.isArray(node) && !isRecord(node)) fail('INVALID_DATA', 'Only plain JSON values are supported.');
    if (seen.has(node)) fail('INVALID_DATA', 'JSON must not contain cycles or shared object references.');
    seen.add(node);
    for (const [key, child] of Object.entries(node)) {
      if (UNSAFE_KEYS.has(key)) fail('INVALID_DATA', 'Reserved object keys are not supported.');
      pending.push({ value: child, depth: item.depth + 1 });
    }
  }
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) fail('TOO_LARGE', 'The data exceeds the host byte limit.');
  return text;
}

export function encodeSnapshot(snapshot) {
  if (!isRecord(snapshot) || snapshot.format !== 'indiff.platform-workspace' || snapshot.version !== 1 || !isRecord(snapshot.workspace) || !isRecord(snapshot.ui) || Object.keys(snapshot).some(k => !['format', 'version', 'workspace', 'ui'].includes(k))) fail('INVALID_SNAPSHOT', 'A version 1 platform workspace and UI snapshot is required.');
  return inspectJSON(snapshot, MAX_WORKSPACE_BYTES);
}

function kindOf(value = 'text') {
  if (!['text', 'workspace'].includes(value)) fail('INVALID_REQUEST', 'Unsupported file kind.');
  return value;
}
function extensionOK(file, kind) { return kind === 'workspace' ? path.extname(file).toLowerCase() === '.json' : TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()); }
function fileLimit(kind) { return kind === 'workspace' ? MAX_WORKSPACE_BYTES : MAX_TEXT_BYTES; }

export function validateText(text, kind = 'text') {
  kindOf(kind);
  if (typeof text !== 'string' || text.includes('\0')) fail('INVALID_TEXT', 'UTF-8 text without NUL characters is required.');
  if (Buffer.from(text, 'utf8').toString('utf8') !== text) fail('INVALID_TEXT', 'Text contains an invalid Unicode surrogate.');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > fileLimit(kind)) fail('TOO_LARGE', `The ${kind} file exceeds its byte limit.`);
  if (kind === 'workspace') {
    let parsed;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail('INVALID_DATA', 'The backup is not valid JSON.'); }
    if (!isRecord(parsed)) fail('INVALID_DATA', 'The backup must be a JSON object.');
    inspectJSON(parsed, MAX_WORKSPACE_BYTES);
  }
  return bytes;
}

export function suggestedName(value, kind = 'text') {
  kindOf(kind);
  const fallback = kind === 'workspace' ? 'indiff-workspace.json' : 'document.md';
  if (typeof value !== 'string') return fallback;
  const name = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 160).replace(/[. ]+$/, '');
  if (!name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) return fallback;
  return extensionOK(name, kind) ? name : `${name}${kind === 'workspace' ? '.json' : '.md'}`;
}

async function statFile(file, allowMissing = false) {
  try {
    const info = await fs.lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) fail('UNSAFE_FILE', 'Only regular files may be selected.');
    return info;
  } catch (error) { if (allowMissing && error.code === 'ENOENT') return null; throw error; }
}

export async function readBounded(file, limit) {
  await statFile(file);
  const opened = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await opened.stat();
    if (!info.isFile()) fail('UNSAFE_FILE', 'Only regular files may be selected.');
    if (info.size > limit) fail('TOO_LARGE', 'The selected file exceeds its byte limit.');
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await opened.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) fail('TOO_LARGE', 'The selected file exceeds its byte limit.');
    const data = bytes.subarray(0, length);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); } catch { fail('INVALID_TEXT', 'The selected file is not valid UTF-8.'); }
    return { text, bytes: length, hash: createHash('sha256').update(data).digest('hex') };
  } finally { await opened.close(); }
}

/** Same-directory write + fsync + rename. A failed commit never unlinks the old file. */
export async function atomicWrite(file, text, beforeCommit = async () => {}) {
  const temp = path.join(path.dirname(file), `.indiff-${randomUUID()}.tmp`);
  let opened;
  try {
    await statFile(file, true);
    opened = await fs.open(temp, 'wx', 0o600);
    await opened.writeFile(text, 'utf8'); await opened.sync(); await opened.close(); opened = null;
    await statFile(file, true);
    await beforeCommit();
    await fs.rename(temp, file);
    // Windows may not support directory fsync; the file itself was flushed above.
    try { const dir = await fs.open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await dir.close(); } } catch {}
  } finally {
    if (opened) await opened.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
  }
}

async function selectedPath(raw, kind, allowMissing = false) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw) || !extensionOK(raw, kind)) fail('UNSAFE_FILE', 'Select a supported text or JSON file.');
  // Parent realpath anchors handles; absolute paths come only from native dialogs.
  const parent = await fs.realpath(path.dirname(raw));
  const file = path.join(parent, path.basename(raw));
  await statFile(file, allowMissing);
  return file;
}

function request(payload, keys) {
  if (!isRecord(payload) || Object.keys(payload).some(k => !keys.includes(k))) fail('INVALID_REQUEST', 'Unsupported payload fields.');
}

/** Dialog functions are injected by Electron; renderer input never supplies a disk path. */
export function createHostController({ workspacePath, dialogs, appVersion = '0.3.0' }) {
  const owners = new Set(), handles = new Map();
  let workspaceQueue = Promise.resolve(), queued = 0, fileBusy = false;
  const assertOwner = owner => { if (!owners.has(owner)) fail('CANCELED', 'The document closed or reloaded before the operation completed.'); };
  const addOwner = () => { const owner = randomUUID(); owners.add(owner); return owner; };
  const revokeOwner = owner => { owners.delete(owner); for (const [key, entry] of handles) if (entry.owner === owner) handles.delete(key); };
  const mint = (owner, file, kind, hash) => {
    const existing = [...handles.entries()].find(([, entry]) => entry.owner === owner && entry.file === file && entry.kind === kind);
    if (existing) { existing[1].hash = hash; return existing[0]; }
    if ([...handles.values()].filter(entry => entry.owner === owner).length >= 200) fail('LIMIT_REACHED', 'Close and reopen the app before opening more native files.');
    const handle = randomUUID(); handles.set(handle, { owner, file, kind, hash }); return handle;
  };
  const canMint = (owner, file, kind) => {
    if (![...handles.values()].some(entry => entry.owner === owner && entry.file === file && entry.kind === kind) && [...handles.values()].filter(entry => entry.owner === owner).length >= 200) fail('LIMIT_REACHED', 'Close and reopen the app before opening more native files.');
  };
  const serialWorkspace = action => {
    if (queued >= 8) return Promise.reject(new HostError('BUSY', 'Too many workspace operations are pending.'));
    queued++;
    const result = workspaceQueue.then(action);
    workspaceQueue = result.catch(() => {}).finally(() => { queued--; });
    return result;
  };
  async function execute(method, payload, owner) {
    assertOwner(owner);
    if (!METHODS.includes(method)) fail('UNSUPPORTED', 'This host capability is not available.');
    if (method === 'host.info') { request(payload, []); return { platform: 'windows', appVersion, native: true, capabilities: METHODS.slice(), limits: { textBytes: MAX_TEXT_BYTES, workspaceBytes: MAX_WORKSPACE_BYTES } }; }
    if (method === 'host.connection') { request(payload, []); return { connected: false, status: 'disconnected', ai: false, terminal: false, mcp: false }; }
    if (method === 'workspace.save') {
      request(payload, ['snapshot']); const encoded = encodeSnapshot(payload.snapshot);
      return serialWorkspace(async () => {
        assertOwner(owner); await fs.mkdir(path.dirname(workspacePath), { recursive: true });
        await atomicWrite(workspacePath, encoded, async () => assertOwner(owner));
        return { saved: true, bytes: Buffer.byteLength(encoded, 'utf8') };
      });
    }
    if (method === 'workspace.load') {
      request(payload, []);
      return serialWorkspace(async () => {
        assertOwner(owner);
        try {
          const { text } = await readBounded(workspacePath, MAX_WORKSPACE_BYTES);
          let snapshot;
          try { snapshot = JSON.parse(text); } catch { fail('CORRUPT_WORKSPACE', 'The saved workspace is damaged. It has been preserved.'); }
          try { encodeSnapshot(snapshot); } catch { fail('CORRUPT_WORKSPACE', 'The saved workspace format is invalid. It has been preserved.'); }
          assertOwner(owner); return { snapshot };
        } catch (error) { if (error.code === 'ENOENT') { assertOwner(owner); return { snapshot: null }; } throw error; }
      });
    }
    if (fileBusy) fail('BUSY', 'Finish the current native file operation first.');
    fileBusy = true;
    try {
      if (method === 'file.pick') {
        request(payload, ['kind']); const kind = kindOf(payload.kind);
        const selection = await dialogs.pick({ kind }); assertOwner(owner);
        if (!selection) return { canceled: true };
        const file = await selectedPath(selection, kind);
        const { text, hash, bytes } = await readBounded(file, fileLimit(kind)); validateText(text, kind); assertOwner(owner);
        return { canceled: false, handle: mint(owner, file, kind, hash), name: path.basename(file), text, bytes };
      }
      if (method === 'file.saveAs') {
        request(payload, ['kind', 'name', 'text']); const kind = kindOf(payload.kind); const bytes = validateText(payload.text, kind);
        const selection = await dialogs.saveAs({ kind, name: suggestedName(payload.name, kind) }); assertOwner(owner);
        if (!selection) return { canceled: true };
        const file = await selectedPath(selection, kind, true);
        canMint(owner, file, kind);
        await atomicWrite(file, payload.text, async () => assertOwner(owner));
        return { canceled: false, handle: mint(owner, file, kind, createHash('sha256').update(payload.text, 'utf8').digest('hex')), name: path.basename(file), bytes };
      }
      request(payload, ['handle', 'text']);
      const entry = typeof payload.handle === 'string' ? handles.get(payload.handle) : null;
      if (!entry || entry.owner !== owner) fail('INVALID_HANDLE', 'Select the file again before saving.');
      const bytes = validateText(payload.text, entry.kind);
      const ensureUnchanged = async () => {
        assertOwner(owner);
        if (await fs.realpath(path.dirname(entry.file)) !== path.dirname(entry.file)) fail('UNSAFE_FILE', 'The selected file location changed. Select the file again.');
        let current;
        try { current = await readBounded(entry.file, fileLimit(entry.kind)); } catch (error) { if (error.code === 'ENOENT') fail('CONFLICT', 'The selected file was removed. Save a new copy instead.'); throw error; }
        if (current.hash !== entry.hash) fail('CONFLICT', 'The selected file changed outside the app. Reopen it or save a new copy.');
        assertOwner(owner);
      };
      await ensureUnchanged();
      await atomicWrite(entry.file, payload.text, ensureUnchanged);
      entry.hash = createHash('sha256').update(payload.text, 'utf8').digest('hex');
      return { canceled: false, handle: payload.handle, name: path.basename(entry.file), bytes };
    } finally { fileBusy = false; }
  }
  return {
    addOwner, revokeOwner,
    async invoke(method, payload = {}, owner) {
      try { return { ok: true, value: await execute(method, payload, owner) }; } catch (error) { return errorEnvelope(error); }
    }
  };
}
