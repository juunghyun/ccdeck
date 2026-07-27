import { useEffect, useState } from 'react'
import type { SessionCardData } from '../../../shared/types'

export function useSessions(): SessionCardData[] {
  const [cards, setCards] = useState<SessionCardData[]>([])

  useEffect(() => {
    let alive = true
    window.ccdeck.getSessions().then((initial) => {
      if (alive) setCards(initial)
    })
    const unsubscribe = window.ccdeck.onSessionsUpdate((next) => setCards(next))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return cards
}
