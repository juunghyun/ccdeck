import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { SessionCardData } from '../../shared/types'
import { TranscriptAccumulator } from './transcript'
import { TranscriptTailReader, findRecentTranscriptFiles } from './scanner'
import { listClaudeProcesses, type ClaudeProcess } from './processes'
import { ACTIVE_WINDOW_MS, buildCards } from './status'

const PROCESS_POLL_MS = 5000
const EMIT_DEBOUNCE_MS = 250

interface FileEntry {
  acc: TranscriptAccumulator
  reader: TranscriptTailReader
  queue: Promise<void>
}

/**
 * 세션 소스 오케스트레이터.
 * 초기 스캔 + chokidar 파일 감시로 트랜스크립트를 증분 파싱하고,
 * 프로세스(ps/lsof) 폴링과 합쳐 'cards' 이벤트로 칸반 카드를 내보낸다.
 */
export class SessionStore extends EventEmitter {
  private files = new Map<string, FileEntry>()
  private procs: ClaudeProcess[] = []
  private watcher: FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly root = path.join(os.homedir(), '.claude', 'projects')) {
    super()
  }

  async start(): Promise<void> {
    const initial = await findRecentTranscriptFiles(this.root, ACTIVE_WINDOW_MS)
    await Promise.all(initial.map((f) => this.ingest(f)))
    this.procs = await listClaudeProcesses()

    this.watcher = chokidar.watch(this.root, { ignoreInitial: true, depth: 2 })
    const onFile = (p: string): void => {
      if (!p.endsWith('.jsonl')) return
      void this.ingest(p).then(() => this.scheduleEmit())
    }
    this.watcher.on('add', onFile)
    this.watcher.on('change', onFile)

    // 프로세스 상태와 시간 경과(stall 판정)는 폴링 주기로 재계산된다
    this.pollTimer = setInterval(() => {
      void listClaudeProcesses().then((procs) => {
        this.procs = procs
        this.scheduleEmit()
      })
    }, PROCESS_POLL_MS)

    this.scheduleEmit()
  }

  getCards(now = Date.now()): SessionCardData[] {
    const sources = [...this.files.entries()].map(([filePath, entry]) => ({
      filePath,
      snap: entry.acc.snapshot()
    }))
    return buildCards(sources, this.procs, now)
  }

  claudeTotals(): { count: number; rssBytes: number } {
    return {
      count: this.procs.length,
      rssBytes: this.procs.reduce((sum, p) => sum + p.rssBytes, 0)
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.emitTimer) clearTimeout(this.emitTimer)
    await this.watcher?.close()
  }

  /** 파일별 직렬 큐로 오프셋 경합 없이 증분 파싱 */
  private ingest(filePath: string): Promise<void> {
    let entry = this.files.get(filePath)
    if (!entry) {
      entry = {
        acc: new TranscriptAccumulator(),
        reader: new TranscriptTailReader(filePath),
        queue: Promise.resolve()
      }
      this.files.set(filePath, entry)
    }
    const e = entry
    e.queue = e.queue
      .then(async () => {
        const { lines, truncated } = await e.reader.readNew()
        if (truncated) e.acc.reset()
        for (const line of lines) e.acc.addLine(line)
      })
      .catch(() => undefined)
    return e.queue
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('cards', this.getCards())
    }, EMIT_DEBOUNCE_MS)
  }
}
