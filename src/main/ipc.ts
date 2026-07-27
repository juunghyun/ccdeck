import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  METRICS_GET,
  METRICS_UPDATE,
  SESSIONS_LIST,
  SESSIONS_UPDATE,
  SESSION_KILL
} from '../shared/ipc'
import { isClaudePid } from './sessions/processes'
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

  ipcMain.handle(SESSION_KILL, async (event, payload: { pid: number; label: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'warning' as const,
      buttons: ['세션 종료', '취소'],
      defaultId: 1,
      cancelId: 1,
      message: 'claude 세션을 종료할까요?',
      detail: `${payload.label}\npid ${payload.pid} — 진행 중이던 작업이 있다면 끊깁니다.`
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    if (response !== 0) return { killed: false }

    if (!(await isClaudePid(payload.pid))) {
      await store.refreshProcesses()
      return { killed: false, reason: 'not-found' }
    }
    try {
      process.kill(payload.pid, 'SIGTERM')
    } catch {
      return { killed: false, reason: 'error' }
    }
    // 프로세스가 정리될 틈을 주고 목록 재수집
    await new Promise((resolve) => setTimeout(resolve, 500))
    await store.refreshProcesses()
    return { killed: true }
  })
}

export function registerMetricsIpc(metrics: SystemMetricsService): void {
  ipcMain.handle(METRICS_GET, () => metrics.getLatest())
  metrics.on('metrics', (payload) => broadcast(METRICS_UPDATE, payload))
}
