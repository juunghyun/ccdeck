import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { DismissedStore } from './sessions/dismissed'
import { SessionStore } from './sessions/store'
import { SystemMetricsService } from './system/metrics'
import { registerMetricsIpc, registerSessionIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'ccdeck',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const store = new SessionStore()
const metrics = new SystemMetricsService(() => store.claudeTotals())

app.whenReady().then(() => {
  const dismissed = new DismissedStore(path.join(app.getPath('userData'), 'dismissed.json'))
  dismissed.load()
  store.setDismissedProvider(dismissed)

  registerSessionIpc(store, dismissed)
  registerMetricsIpc(metrics)
  store.start().catch((err) => console.error('[ccdeck] session store failed to start:', err))
  metrics.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  metrics.stop()
  void store.stop()
})
