import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import { promisify } from 'node:util'
import type { SystemMetrics } from '../../shared/types'

const exec = promisify(execFile)

export interface VmStatResult {
  pageSize: number
  pages: Record<string, number>
}

/** `vm_stat` 출력 파싱 — 라인 형식: `Pages active:                12345.` */
export function parseVmStat(output: string): VmStatResult {
  const sizeMatch = output.match(/page size of (\d+) bytes/)
  const pageSize = sizeMatch ? Number(sizeMatch[1]) : 16384
  const pages: Record<string, number> = {}
  for (const line of output.split('\n')) {
    const m = line.match(/^"?(.+?)"?:\s+(\d+)\.?\s*$/)
    if (m) pages[m[1].trim()] = Number(m[2])
  }
  return { pageSize, pages }
}

/** `sysctl -n vm.swapusage` 출력에서 used 바이트 파싱 — `total = 2048.00M  used = 532.75M ...` */
export function parseSwapUsedBytes(output: string): number {
  const m = output.match(/used\s*=\s*([\d.]+)([KMGT])/i)
  if (!m) return 0
  const value = Number(m[1])
  const unit = m[2].toUpperCase()
  const factor = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] ?? 1
  return Math.round(value * factor)
}

/** os.cpus() 누적 시간의 폴링 간 델타로 전체 CPU 사용률(%)을 계산 */
export class CpuSampler {
  private prev = cpuTotals()

  sample(): number {
    const current = cpuTotals()
    const busy = current.busy - this.prev.busy
    const total = current.total - this.prev.total
    this.prev = current
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, (busy / total) * 100))
  }
}

function cpuTotals(): { busy: number; total: number } {
  let busy = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const { user, nice, sys, idle, irq } = cpu.times
    busy += user + nice + sys + irq
    total += user + nice + sys + irq + idle
  }
  return { busy, total }
}

export async function collectSystemMetrics(
  sampler: CpuSampler,
  claudeTotals: () => { count: number; rssBytes: number }
): Promise<SystemMetrics> {
  const totalBytes = os.totalmem()
  let usedBytes = totalBytes - os.freemem() // vm_stat 실패 시 폴백 (과대집계 경향)
  let compressedBytes = 0
  let swapUsedBytes = 0

  try {
    const { stdout } = await exec('vm_stat', [], { maxBuffer: 1024 * 1024 })
    const { pageSize, pages } = parseVmStat(stdout)
    const active = pages['Pages active'] ?? 0
    const wired = pages['Pages wired down'] ?? 0
    const compressed = pages['Pages occupied by compressor'] ?? 0
    usedBytes = (active + wired + compressed) * pageSize
    compressedBytes = compressed * pageSize
  } catch {
    // 폴백 유지
  }

  try {
    const { stdout } = await exec('sysctl', ['-n', 'vm.swapusage'], { maxBuffer: 1024 * 1024 })
    swapUsedBytes = parseSwapUsedBytes(stdout)
  } catch {
    // 스왑 정보 없이 진행
  }

  const claude = claudeTotals()
  return {
    memory: { totalBytes, usedBytes, compressedBytes, swapUsedBytes },
    cpu: { usagePercent: sampler.sample(), loadAvg1: os.loadavg()[0] },
    claude: { processCount: claude.count, rssBytes: claude.rssBytes },
    sampledAt: Date.now()
  }
}

const METRICS_POLL_MS = 5000

/** 시스템 메트릭 폴링 서비스 — 'metrics' 이벤트로 SystemMetrics를 내보낸다 */
export class SystemMetricsService extends EventEmitter {
  private sampler = new CpuSampler()
  private latest: SystemMetrics | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly claudeTotals: () => { count: number; rssBytes: number },
    private readonly intervalMs = METRICS_POLL_MS
  ) {
    super()
  }

  start(): void {
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  getLatest(): SystemMetrics | null {
    return this.latest
  }

  private async tick(): Promise<void> {
    try {
      this.latest = await collectSystemMetrics(this.sampler, this.claudeTotals)
      this.emit('metrics', this.latest)
    } catch {
      // 다음 폴링에서 재시도
    }
  }
}
