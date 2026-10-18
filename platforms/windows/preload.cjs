'use strict';
// Sandboxed preload: Electron bridge only. No Node filesystem, shell, event, or path API.
const { contextBridge, ipcRenderer } = require('electron');
const methods = new Set(['host.info', 'host.connection', 'workspace.load', 'workspace.save', 'file.pick', 'file.save', 'file.saveAs']);
const error = (code, message) => ({ ok: false, error: { code, message } });
contextBridge.exposeInMainWorld('indiffNative', Object.freeze({
  async invoke(method, payload = {}) {
    if (typeof method !== 'string' || !methods.has(method)) return error('UNSUPPORTED', 'This host capability is not available.');
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return error('INVALID_REQUEST', 'A JSON object payload is required.');
      // Bound the wire envelope before IPC. Host validates UTF-8 bytes and individual fields.
      const encoded = JSON.stringify(payload);
      if (encoded.length > 8 * 1024 * 1024) return error('TOO_LARGE', 'The native request exceeds its size limit.');
      return await ipcRenderer.invoke('indiff-native:invoke:v1', method, JSON.parse(encoded));
    } catch { return error('NATIVE_ERROR', 'The native request could not complete. No successful save is confirmed.'); }
  }
}));
