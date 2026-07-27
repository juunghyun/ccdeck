import type { SessionCardData, SessionStatus } from '../../shared/types'

/** 확인필요 카드 에이징 임계 */
export const AGING_WARM_MS = 10 * 60 * 1000
export const AGING_HOT_MS = 45 * 60 * 1000

export type AgingLevel = 'none' | 'warm' | 'hot'

export type SortKey = 'recent' | 'oldest' | 'context' | 'memory'

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'recent', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
  { value: 'context', label: '컨텍스트순' },
  { value: 'memory', label: '메모리순' }
]

export const DEFAULT_SORT: Record<SessionStatus, SortKey> = {
  running: 'recent',
  attention: 'recent',
  done: 'recent'
}

export function orderColumn(
  cards: SessionCardData[],
  status: SessionStatus,
  sortKey: SortKey = 'recent'
): SessionCardData[] {
  const list = cards.filter((c) => c.status === status)
  switch (sortKey) {
    case 'oldest':
      return list.sort((a, b) => a.lastActivityAt - b.lastActivityAt)
    case 'context':
      // 게이지 없는 카드는 뒤로
      return list.sort((a, b) => (b.context?.percent ?? -1) - (a.context?.percent ?? -1))
    case 'memory':
      // 프로세스 없는 카드는 뒤로
      return list.sort((a, b) => (b.process?.rssBytes ?? -1) - (a.process?.rssBytes ?? -1))
    case 'recent':
    default:
      return list.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  }
}

export function agingLevel(card: SessionCardData, now: number): AgingLevel {
  if (card.status !== 'attention') return 'none'
  const waiting = now - card.lastActivityAt
  if (waiting >= AGING_HOT_MS) return 'hot'
  if (waiting >= AGING_WARM_MS) return 'warm'
  return 'none'
}
