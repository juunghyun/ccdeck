import path from 'node:path'
import {
  CONTEXT_WINDOW_TOKENS,
  type AttentionReason,
  type SessionCardData,
  type SessionStatus
} from '../../shared/types'
import { SUBAGENT_TOOLS, type TranscriptSnapshot } from './transcript'
import type { ClaudeProcess } from './processes'

/** 보드에 올릴 세션의 최근 활동 윈도우 */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000
/** 턴이 열린 채 이 시간 이상 조용하면 '응답 정지 추정' */
export const STALL_MS = 10 * 60 * 1000

export interface SessionSource {
  filePath: string
  snap: TranscriptSnapshot
}

export function deriveStatus(
  snap: TranscriptSnapshot,
  hasProcess: boolean,
  now: number
): { status: SessionStatus; reason: AttentionReason | null } {
  if (!hasProcess) return { status: 'done', reason: null }
  if (snap.turnOpen) {
    if (snap.pendingToolUses.some((t) => t.name === 'AskUserQuestion')) {
      return { status: 'attention', reason: 'question' }
    }
    const idle = now - (snap.lastActivityAt ?? 0)
    if (idle > STALL_MS) return { status: 'attention', reason: 'stalled' }
    return { status: 'running', reason: null }
  }
  if (snap.lastAssistantText !== null || snap.firstPrompt !== null) {
    return { status: 'attention', reason: 'turn-ended' }
  }
  return { status: 'attention', reason: 'idle' }
}

/**
 * 스냅샷 + 프로세스 목록으로 칸반 카드를 만든다.
 *
 * 프로세스↔세션 매칭은 cwd 기준. 같은 cwd에 세션이 여러 개면
 * 최근 활동 순으로 프로세스를 배정하고(나머지는 종료로 간주),
 * 프로세스 수보다 세션이 많으면 shared 플래그로 모호함을 표시한다.
 */
export function buildCards(
  sources: SessionSource[],
  procs: ClaudeProcess[],
  now: number
): SessionCardData[] {
  const procsByCwd = new Map<string, ClaudeProcess[]>()
  for (const p of procs) {
    if (!p.cwd) continue
    const list = procsByCwd.get(p.cwd) ?? []
    list.push(p)
    procsByCwd.set(p.cwd, list)
  }

  const byCwd = new Map<string, SessionSource[]>()
  for (const s of sources) {
    if (!s.snap.sessionId || !s.snap.cwd || s.snap.lastActivityAt === null) continue
    const list = byCwd.get(s.snap.cwd) ?? []
    list.push(s)
    byCwd.set(s.snap.cwd, list)
  }

  const cards: SessionCardData[] = []
  for (const [cwd, list] of byCwd) {
    list.sort((a, b) => (b.snap.lastActivityAt ?? 0) - (a.snap.lastActivityAt ?? 0))
    const available = [...(procsByCwd.get(cwd) ?? [])]
    const ambiguous = available.length > 0 && list.length > available.length
    for (const src of list) {
      const proc = available.shift() ?? null
      const card = toCard(src, proc, ambiguous, now)
      if (card) cards.push(card)
    }
  }
  cards.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  return cards
}

function toCard(
  src: SessionSource,
  proc: ClaudeProcess | null,
  shared: boolean,
  now: number
): SessionCardData | null {
  const snap = src.snap
  // 프롬프트도 프로세스도 없는 빈 세션 파일은 노이즈
  if (!snap.firstPrompt && !proc) return null
  const { status, reason } = deriveStatus(snap, proc !== null, now)
  const lastActivityAt = snap.lastActivityAt ?? 0
  if (status === 'done' && now - lastActivityAt > ACTIVE_WINDOW_MS) return null

  const subagents = snap.pendingToolUses.filter((t) => SUBAGENT_TOOLS.has(t.name))
  return {
    sessionId: snap.sessionId as string,
    filePath: src.filePath,
    cwd: snap.cwd as string,
    projectName: path.basename(snap.cwd as string),
    gitBranch: snap.gitBranch && snap.gitBranch !== 'HEAD' ? snap.gitBranch : null,
    status,
    attentionReason: reason,
    title: snap.title ?? snap.compactSummary,
    firstPrompt: snap.firstPrompt,
    lastAssistantText: snap.lastAssistantText,
    model: snap.model,
    sessionStartedAt: snap.sessionStartedAt,
    turnStartedAt: snap.turnOpen ? snap.turnStartedAt : null,
    lastActivityAt,
    tokens: snap.tokens,
    context:
      snap.lastContextTokens !== null
        ? {
            tokens: snap.lastContextTokens,
            percent: Math.min(100, (snap.lastContextTokens / CONTEXT_WINDOW_TOKENS) * 100)
          }
        : null,
    subagents: {
      active: subagents.length,
      names: subagents.map((t) => t.description ?? t.name)
    },
    process: proc ? { pid: proc.pid, rssBytes: proc.rssBytes, shared } : null,
    dismissed: false
  }
}
