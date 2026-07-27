import type { SystemMetrics } from '../../../shared/types'
import { formatRss } from '../format'

function memoryTone(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warn'
  return 'ok'
}

export function StatusBar({ metrics }: { metrics: SystemMetrics | null }) {
  if (!metrics) {
    return (
      <footer className="status-bar">
        <span className="segment muted">시스템 메트릭 수집 중…</span>
      </footer>
    )
  }

  const { memory, cpu, claude } = metrics
  const memPercent = memory.totalBytes > 0 ? (memory.usedBytes / memory.totalBytes) * 100 : 0
  const tone = memoryTone(memPercent)

  return (
    <footer className="status-bar num">
      <span className={`segment memory-${tone}`}>
        메모리 {formatRss(memory.usedBytes)} / {formatRss(memory.totalBytes)} (
        {Math.round(memPercent)}%)
      </span>
      <span className="segment">압축 {formatRss(memory.compressedBytes)}</span>
      <span className="segment">스왑 {formatRss(memory.swapUsedBytes)}</span>
      <span className="divider" aria-hidden="true" />
      <span className="segment">
        CPU {Math.round(cpu.usagePercent)}% · load {cpu.loadAvg1.toFixed(1)}
      </span>
      <span className="divider" aria-hidden="true" />
      <span className="segment">
        claude {claude.processCount}개 · {formatRss(claude.rssBytes)}
      </span>
    </footer>
  )
}
