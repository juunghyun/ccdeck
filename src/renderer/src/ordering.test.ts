import { describe, expect, it } from 'vitest'
import { AGING_HOT_MS, AGING_WARM_MS, agingLevel, orderColumn } from './ordering'
import type { SessionCardData } from '../../shared/types'

const NOW = Date.parse('2026-01-02T12:00:00.000Z')

function card(overrides: Partial<SessionCardData>): SessionCardData {
  return {
    sessionId: 'sess-x',
    filePath: '/f/x.jsonl',
    cwd: '/tmp/demo',
    projectName: 'demo',
    gitBranch: null,
    status: 'attention',
    attentionReason: 'turn-ended',
    title: null,
    firstPrompt: '작업',
    lastAssistantText: null,
    model: null,
    sessionStartedAt: NOW - 3_600_000,
    turnStartedAt: null,
    lastActivityAt: NOW - 60_000,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    context: null,
    subagents: { active: 0, names: [] },
    process: null,
    ...overrides
  }
}

describe('orderColumn', () => {
  it('확인필요 컬럼은 오래 기다린 카드가 위로 온다 (FIFO)', () => {
    const cards = [
      card({ sessionId: 'recent', lastActivityAt: NOW - 60_000 }),
      card({ sessionId: 'oldest', lastActivityAt: NOW - 3_600_000 }),
      card({ sessionId: 'middle', lastActivityAt: NOW - 600_000 })
    ]
    expect(orderColumn(cards, 'attention').map((c) => c.sessionId)).toEqual([
      'oldest',
      'middle',
      'recent'
    ])
  })

  it('실행중 컬럼은 최근 활동 순', () => {
    const cards = [
      card({ sessionId: 'old', status: 'running', lastActivityAt: NOW - 600_000 }),
      card({ sessionId: 'new', status: 'running', lastActivityAt: NOW - 1_000 })
    ]
    expect(orderColumn(cards, 'running').map((c) => c.sessionId)).toEqual(['new', 'old'])
  })

  it('다른 상태의 카드는 섞이지 않는다', () => {
    const cards = [card({ status: 'running' }), card({ status: 'attention' })]
    expect(orderColumn(cards, 'attention')).toHaveLength(1)
  })
})

describe('agingLevel', () => {
  it('10분 미만은 none', () => {
    expect(agingLevel(card({ lastActivityAt: NOW - 5 * 60_000 }), NOW)).toBe('none')
  })

  it('10분 이상은 warm, 45분 이상은 hot', () => {
    expect(agingLevel(card({ lastActivityAt: NOW - AGING_WARM_MS }), NOW)).toBe('warm')
    expect(agingLevel(card({ lastActivityAt: NOW - AGING_HOT_MS }), NOW)).toBe('hot')
  })

  it('확인필요가 아닌 카드는 항상 none', () => {
    expect(agingLevel(card({ status: 'running', lastActivityAt: NOW - AGING_HOT_MS }), NOW)).toBe(
      'none'
    )
  })
})
