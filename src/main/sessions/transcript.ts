import type { TokenTotals } from '../../shared/types'

export const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])

export interface PendingToolUse {
  id: string
  name: string
  description: string | null
  startedAt: number | null
}

export interface TranscriptSnapshot {
  sessionId: string | null
  cwd: string | null
  gitBranch: string | null
  title: string | null
  compactSummary: string | null
  firstPrompt: string | null
  lastAssistantText: string | null
  model: string | null
  sessionStartedAt: number | null
  turnStartedAt: number | null
  lastActivityAt: number | null
  turnOpen: boolean
  tokens: TokenTotals
  /** 메인 체인 마지막 API 호출의 프롬프트+출력 토큰 ≈ 현재 컨텍스트 크기 */
  lastContextTokens: number | null
  pendingToolUses: PendingToolUse[]
}

export function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed
}

/**
 * Claude Code 세션 JSONL을 한 줄씩 먹여 세션 상태를 누적한다.
 *
 * 스키마 주의점 (실파일 관찰 기준):
 * - assistant 메시지는 content 블록별로 여러 줄로 쪼개지며 usage가 반복된다
 *   → message.id 기준으로 한 번만 집계
 * - 서브에이전트 대화는 isSidechain=true로 같은 파일에 섞인다
 *   → 토큰만 집계하고 턴 상태에는 반영하지 않음
 * - 세션 제목은 type:"ai-title"의 aiTitle 필드
 */
export class TranscriptAccumulator {
  private sessionId: string | null = null
  private cwd: string | null = null
  private gitBranch: string | null = null
  private title: string | null = null
  private compactSummary: string | null = null
  private firstPrompt: string | null = null
  private lastAssistantText: string | null = null
  private model: string | null = null
  private sessionStartedAt: number | null = null
  private turnStartedAt: number | null = null
  private lastActivityAt: number | null = null
  private turnOpen = false
  private tokens: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  private lastContextTokens: number | null = null
  private pending = new Map<string, PendingToolUse>()
  private seenUsageIds = new Set<string>()

  reset(): void {
    this.sessionId = null
    this.cwd = null
    this.gitBranch = null
    this.title = null
    this.compactSummary = null
    this.firstPrompt = null
    this.lastAssistantText = null
    this.model = null
    this.sessionStartedAt = null
    this.turnStartedAt = null
    this.lastActivityAt = null
    this.turnOpen = false
    this.tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
    this.lastContextTokens = null
    this.pending.clear()
    this.seenUsageIds.clear()
  }

  addLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(trimmed)
    } catch {
      return
    }
    if (typeof entry !== 'object' || entry === null) return

    if (this.sessionId === null && typeof entry.sessionId === 'string') {
      this.sessionId = entry.sessionId
    }
    const ts = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
    if (!Number.isNaN(ts)) {
      this.sessionStartedAt ??= ts
      if (this.lastActivityAt === null || ts > this.lastActivityAt) this.lastActivityAt = ts
    }

    switch (entry.type) {
      case 'ai-title':
        if (typeof entry.aiTitle === 'string' && entry.aiTitle) this.title = entry.aiTitle
        break
      case 'summary':
        if (typeof entry.summary === 'string' && entry.summary) this.compactSummary = entry.summary
        break
      case 'user':
        this.onUser(entry, Number.isNaN(ts) ? null : ts)
        break
      case 'assistant':
        this.onAssistant(entry, Number.isNaN(ts) ? null : ts)
        break
      default:
        break
    }
  }

  snapshot(): TranscriptSnapshot {
    return {
      sessionId: this.sessionId,
      cwd: this.cwd,
      gitBranch: this.gitBranch,
      title: this.title,
      compactSummary: this.compactSummary,
      firstPrompt: this.firstPrompt,
      lastAssistantText: this.lastAssistantText,
      model: this.model,
      sessionStartedAt: this.sessionStartedAt,
      turnStartedAt: this.turnStartedAt,
      lastActivityAt: this.lastActivityAt,
      turnOpen: this.turnOpen,
      tokens: { ...this.tokens },
      lastContextTokens: this.lastContextTokens,
      pendingToolUses: [...this.pending.values()]
    }
  }

  private trackLocation(entry: Record<string, unknown>): void {
    // cwd는 최초값 고정 — 셸 cd를 따라 바뀌는 이후 값과 달리,
    // 최초 cwd는 claude 프로세스의 실행 디렉토리(프로세스 cwd)와 일치해 매칭 키로 쓸 수 있다
    if (this.cwd === null && typeof entry.cwd === 'string' && entry.cwd) this.cwd = entry.cwd
    if (typeof entry.gitBranch === 'string' && entry.gitBranch) this.gitBranch = entry.gitBranch
  }

  private onUser(entry: Record<string, unknown>, ts: number | null): void {
    if (entry.isSidechain === true) return
    this.trackLocation(entry)
    if (entry.isMeta === true) return

    const message = entry.message as { content?: unknown } | undefined
    const content = message?.content
    let promptText = ''
    if (typeof content === 'string') {
      promptText = content
    } else if (Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          this.pending.delete(block.tool_use_id)
        }
      }
      promptText = (content as Array<Record<string, unknown>>)
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n')
    }

    promptText = promptText.trim()
    if (!promptText) return
    if (promptText.startsWith('[Request interrupted')) {
      // 사용자가 턴을 끊음 — 열린 턴과 대기 툴 상태를 정리
      this.turnOpen = false
      this.turnStartedAt = null
      this.pending.clear()
      return
    }
    // 로컬 커맨드 출력·시스템 리마인더 등 메타 라인
    if (promptText.startsWith('<') || promptText.startsWith('Caveat:')) return

    this.firstPrompt ??= truncate(promptText, 200)
    this.turnOpen = true
    if (ts !== null) this.turnStartedAt = ts
  }

  private onAssistant(entry: Record<string, unknown>, ts: number | null): void {
    const msg = entry.message as
      | {
          id?: unknown
          model?: unknown
          stop_reason?: unknown
          content?: unknown
          usage?: Record<string, unknown>
        }
      | undefined
    if (!msg) return

    const usage = msg.usage
    if (usage && typeof msg.id === 'string' && !this.seenUsageIds.has(msg.id)) {
      this.seenUsageIds.add(msg.id)
      this.tokens.input += asNumber(usage.input_tokens)
      this.tokens.output += asNumber(usage.output_tokens)
      this.tokens.cacheRead += asNumber(usage.cache_read_input_tokens)
      this.tokens.cacheCreation += asNumber(usage.cache_creation_input_tokens)
    }

    // 서브에이전트(sidechain) 대화는 토큰만 집계 — 컨텍스트는 메인 체인 것만
    if (entry.isSidechain === true) return
    this.trackLocation(entry)
    if (typeof msg.model === 'string') this.model = msg.model
    if (usage) {
      // 같은 메시지의 반복 라인은 같은 값이라 덮어써도 무해
      this.lastContextTokens =
        asNumber(usage.input_tokens) +
        asNumber(usage.cache_read_input_tokens) +
        asNumber(usage.cache_creation_input_tokens) +
        asNumber(usage.output_tokens)
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (!block) continue
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          this.pending.set(block.id, {
            id: block.id,
            name: String(block.name ?? ''),
            description: describeToolUse(block.name, block.input as Record<string, unknown> | undefined),
            startedAt: ts
          })
        } else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          this.lastAssistantText = truncate(block.text, 300)
        }
      }
    }

    if (msg.stop_reason === 'end_turn') {
      this.turnOpen = false
      this.turnStartedAt = null
    }
  }
}

function describeToolUse(name: unknown, input: Record<string, unknown> | undefined): string | null {
  if (!SUBAGENT_TOOLS.has(String(name))) return null
  if (typeof input?.description === 'string' && input.description) return truncate(input.description, 60)
  if (typeof input?.prompt === 'string' && input.prompt) return truncate(input.prompt, 60)
  return null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
