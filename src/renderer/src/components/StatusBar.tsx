import type { SessionCardData, SystemMetrics } from '../../../shared/types'
import { formatRss } from '../format'

function memoryTone(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warn'
  return 'ok'
}

/** 이 시간 이상 방치된 확인필요 세션을 회수 후보로 집계 */
const RECLAIM_IDLE_MS = 30 * 60 * 1000

export function StatusBar({
  metrics,
  cards,
  now
}: {
  metrics: SystemMetrics | null
  cards: SessionCardData[]
  now: number
}) {
  const reclaimable = cards.filter(
    (c) => c.status === 'attention' && c.process && now - c.lastActivityAt >= RECLAIM_IDLE_MS
  )
  const reclaimBytes = reclaimable.reduce((sum, c) => sum + (c.process?.rssBytes ?? 0), 0)

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
      {reclaimable.length > 0 && (
        <span className="segment reclaim-hint">
          방치 30분+ 세션 {reclaimable.length}개 종료 시 ~{formatRss(reclaimBytes)} 회수 가능
        </span>
      )}
    </footer>
  )
}
