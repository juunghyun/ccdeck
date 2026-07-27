/// <reference types="vite/client" />
import type { SessionCardData, SystemMetrics } from '../../shared/types'

declare global {
  interface Window {
    ccdeck: {
      platform: string
      getSessions(): Promise<SessionCardData[]>
      onSessionsUpdate(callback: (cards: SessionCardData[]) => void): () => void
      getSystemMetrics(): Promise<SystemMetrics | null>
      onSystemMetricsUpdate(callback: (metrics: SystemMetrics) => void): () => void
      killSession(pid: number, label: string): Promise<{ killed: boolean; reason?: string }>
    }
  }
}

export {}
