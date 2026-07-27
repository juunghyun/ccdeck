import type { SessionCardData, SessionStatus } from '../../shared/types'

/** 확인필요 카드 에이징 임계 */
export const AGING_WARM_MS = 10 * 60 * 1000
export const AGING_HOT_MS = 45 * 60 * 1000

export type AgingLevel = 'none' | 'warm' | 'hot'

/**
 * 컬럼별 정렬 — 확인필요는 오래 기다린 카드가 위로(FIFO),
 * 나머지는 최근 활동 순.
 */
export function orderColumn(cards: SessionCardData[], status: SessionStatus): SessionCardData[] {
  const list = cards.filter((c) => c.status === status)
  if (status === 'attention') {
    return list.sort((a, b) => a.lastActivityAt - b.lastActivityAt)
  }
  return list.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
}

export function agingLevel(card: SessionCardData, now: number): AgingLevel {
  if (card.status !== 'attention') return 'none'
  const waiting = now - card.lastActivityAt
  if (waiting >= AGING_HOT_MS) return 'hot'
  if (waiting >= AGING_WARM_MS) return 'warm'
  return 'none'
}
