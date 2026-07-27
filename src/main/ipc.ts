import { BrowserWindow, ipcMain } from 'electron'
import { METRICS_GET, METRICS_UPDATE, SESSIONS_LIST, SESSIONS_UPDATE } from '../shared/ipc'
import type { SessionStore } from './sessions/store'
import type { SystemMetricsService } from './system/metrics'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerSessionIpc(store: SessionStore): void {
  ipcMain.handle(SESSIONS_LIST, () => store.getCards())
  store.on('cards', (cards) => broadcast(SESSIONS_UPDATE, cards))
}

export function registerMetricsIpc(metrics: SystemMetricsService): void {
  ipcMain.handle(METRICS_GET, () => metrics.getLatest())
  metrics.on('metrics', (payload) => broadcast(METRICS_UPDATE, payload))
}
