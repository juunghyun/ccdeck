/**
 * 개발용 원샷 스캔 — 실제 로컬 환경에서 파서·상태 도출을 검증한다.
 * 출력은 터미널에만 나가며 레포에 어떤 데이터도 남기지 않는다.
 */
import os from 'node:os'
import path from 'node:path'
import { TranscriptAccumulator } from '../src/main/sessions/transcript'
import { TranscriptTailReader, findRecentTranscriptFiles } from '../src/main/sessions/scanner'
import { listClaudeProcesses } from '../src/main/sessions/processes'
import { ACTIVE_WINDOW_MS, buildCards } from '../src/main/sessions/status'
import { CpuSampler, collectSystemMetrics } from '../src/main/system/metrics'

async function main(): Promise<void> {
  const root = path.join(os.homedir(), '.claude', 'projects')
  const started = Date.now()
  const files = await findRecentTranscriptFiles(root, ACTIVE_WINDOW_MS)
  console.log(`transcripts(24h): ${files.length}`)

  const sources = await Promise.all(
    files.map(async (filePath) => {
      const acc = new TranscriptAccumulator()
      const reader = new TranscriptTailReader(filePath)
      const { lines } = await reader.readNew()
      for (const line of lines) acc.addLine(line)
      return { filePath, snap: acc.snapshot() }
    })
  )
  console.log(`parsed in ${Date.now() - started}ms`)

  const procs = await listClaudeProcesses()
  console.log(`claude processes: ${procs.length} (cwd 확인: ${procs.filter((p) => p.cwd).length})`)

  const metrics = await collectSystemMetrics(new CpuSampler(), () => ({
    count: procs.length,
    rssBytes: procs.reduce((sum, p) => sum + p.rssBytes, 0)
  }))
  const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)}GB`
  console.log(
    `system: 메모리 ${gb(metrics.memory.usedBytes)}/${gb(metrics.memory.totalBytes)}` +
      ` (압축 ${gb(metrics.memory.compressedBytes)}, 스왑 ${gb(metrics.memory.swapUsedBytes)})` +
      ` · CPU ${metrics.cpu.usagePercent.toFixed(0)}% load ${metrics.cpu.loadAvg1.toFixed(1)}` +
      ` · claude ${metrics.claude.processCount}개 ${gb(metrics.claude.rssBytes)}`
  )

  const cards = buildCards(sources, procs, Date.now())
  const counts = { running: 0, attention: 0, done: 0 }
  for (const c of cards) counts[c.status]++
  console.log(`cards: ${cards.length}`, counts)
  console.log('')

  for (const c of cards) {
    console.log(
      [
        c.status.padEnd(9),
        (c.attentionReason ?? '-').padEnd(10),
        c.projectName.slice(0, 34).padEnd(36),
        (c.title ?? c.firstPrompt ?? '').slice(0, 30).padEnd(32),
        c.process ? `pid ${c.process.pid} ${(c.process.rssBytes / 1048576).toFixed(0)}MB${c.process.shared ? '±' : ''}` : '-',
        `out ${c.tokens.output}`,
        c.subagents.active > 0 ? `agents ${c.subagents.active}` : ''
      ].join(' ')
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
