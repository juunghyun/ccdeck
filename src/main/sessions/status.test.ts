import { describe, expect, it } from 'vitest'
import { ACTIVE_WINDOW_MS, buildCards, deriveStatus } from './status'
import type { TranscriptSnapshot } from './transcript'
import type { ClaudeProcess } from './processes'

const NOW = Date.parse('2026-01-02T12:00:00.000Z')

function snap(overrides: Partial<TranscriptSnapshot> = {}): TranscriptSnapshot {
  return {
    sessionId: 'sess-0001',
    cwd: '/tmp/demo-project',
    gitBranch: 'feature/demo',
    title: '데모 작업',
    compactSummary: null,
    firstPrompt: '데모 작업 해줘',
    lastAssistantText: '완료했습니다',
    model: 'claude-fable-5',
    sessionStartedAt: NOW - 3_600_000,
    turnStartedAt: null,
    lastActivityAt: NOW - 60_000,
    turnOpen: false,
    tokens: { input: 10, output: 500, cacheRead: 2000, cacheCreation: 100 },
    pendingToolUses: [],
    ...overrides
  }
}

function proc(overrides: Partial<ClaudeProcess> = {}): ClaudeProcess {
  return { pid: 1000, rssBytes: 512 * 1024 * 1024, elapsedMs: 3_600_000, cwd: '/tmp/demo-project', ...overrides }
}

describe('deriveStatus', () => {
  it('프로세스가 없으면 done', () => {
    expect(deriveStatus(snap(), false, NOW)).toEqual({ status: 'done', reason: null })
  })

  it('턴이 열려 있고 최근 활동이 있으면 running', () => {
    const s = snap({ turnOpen: true, turnStartedAt: NOW - 120_000, lastActivityAt: NOW - 5_000 })
    expect(deriveStatus(s, true, NOW)).toEqual({ status: 'running', reason: null })
  })

  it('AskUserQuestion 대기 중이면 question', () => {
    const s = snap({
      turnOpen: true,
      lastActivityAt: NOW - 5_000,
      pendingToolUses: [{ id: 'tu_q', name: 'AskUserQuestion', description: null, startedAt: NOW }]
    })
    expect(deriveStatus(s, true, NOW)).toEqual({ status: 'attention', reason: 'question' })
  })

  it('턴이 열린 채 10분 넘게 조용하면 stalled', () => {
    const s = snap({ turnOpen: true, lastActivityAt: NOW - 11 * 60_000 })
    expect(deriveStatus(s, true, NOW)).toEqual({ status: 'attention', reason: 'stalled' })
  })

  it('턴이 닫혀 있으면 turn-ended', () => {
    expect(deriveStatus(snap(), true, NOW)).toEqual({ status: 'attention', reason: 'turn-ended' })
  })

  it('프롬프트도 응답도 없는 새 세션은 idle', () => {
    const s = snap({ firstPrompt: null, lastAssistantText: null, title: null })
    expect(deriveStatus(s, true, NOW)).toEqual({ status: 'attention', reason: 'idle' })
  })
})

describe('buildCards', () => {
  it('같은 cwd의 세션 여러 개 중 최근 활동 세션이 프로세스를 가져간다', () => {
    const sources = [
      { filePath: '/f/old.jsonl', snap: snap({ sessionId: 'old', lastActivityAt: NOW - 7_200_000 }) },
      { filePath: '/f/new.jsonl', snap: snap({ sessionId: 'new', lastActivityAt: NOW - 30_000 }) }
    ]
    const cards = buildCards(sources, [proc()], NOW)
    const byId = new Map(cards.map((c) => [c.sessionId, c]))
    expect(byId.get('new')?.process?.pid).toBe(1000)
    expect(byId.get('new')?.process?.shared).toBe(true) // 세션 2 > 프로세스 1 → 모호
    expect(byId.get('old')?.process).toBeNull()
    expect(byId.get('old')?.status).toBe('done')
  })

  it('세션 수와 프로세스 수가 일치하면 shared가 아니다', () => {
    const sources = [{ filePath: '/f/a.jsonl', snap: snap() }]
    const cards = buildCards(sources, [proc()], NOW)
    expect(cards[0].process?.shared).toBe(false)
  })

  it('활동 윈도우를 벗어난 done 세션은 제외한다', () => {
    const sources = [
      { filePath: '/f/stale.jsonl', snap: snap({ lastActivityAt: NOW - ACTIVE_WINDOW_MS - 1 }) }
    ]
    expect(buildCards(sources, [], NOW)).toEqual([])
  })

  it('프롬프트도 프로세스도 없는 빈 세션은 카드로 만들지 않는다', () => {
    const sources = [
      { filePath: '/f/empty.jsonl', snap: snap({ firstPrompt: null, title: null, lastAssistantText: null }) }
    ]
    expect(buildCards(sources, [], NOW)).toEqual([])
  })

  it('gitBranch HEAD는 브랜치 없음으로 처리한다', () => {
    const sources = [{ filePath: '/f/a.jsonl', snap: snap({ gitBranch: 'HEAD' }) }]
    const cards = buildCards(sources, [proc()], NOW)
    expect(cards[0].gitBranch).toBeNull()
  })
})
