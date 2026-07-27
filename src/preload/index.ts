import { contextBridge, ipcRenderer } from 'electron'
import { METRICS_GET, METRICS_UPDATE, SESSIONS_LIST, SESSIONS_UPDATE } from '../shared/ipc'

function subscribe(channel: string, callback: (payload: unknown) => void): () => void {
  const listener = (_event: unknown, payload: unknown): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('ccdeck', {
  platform: process.platform,
  getSessions: () => ipcRenderer.invoke(SESSIONS_LIST),
  onSessionsUpdate: (callback: (cards: unknown) => void) => subscribe(SESSIONS_UPDATE, callback),
  getSystemMetrics: () => ipcRenderer.invoke(METRICS_GET),
  onSystemMetricsUpdate: (callback: (metrics: unknown) => void) =>
    subscribe(METRICS_UPDATE, callback)
})
