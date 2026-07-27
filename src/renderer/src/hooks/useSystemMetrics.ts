import { useEffect, useState } from 'react'
import type { SystemMetrics } from '../../../shared/types'

export function useSystemMetrics(): SystemMetrics | null {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)

  useEffect(() => {
    let alive = true
    window.ccdeck.getSystemMetrics().then((initial) => {
      if (alive && initial) setMetrics(initial)
    })
    const unsubscribe = window.ccdeck.onSystemMetricsUpdate((next) => setMetrics(next))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return metrics
}
