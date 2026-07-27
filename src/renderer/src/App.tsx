import { useState } from 'react'
import type { SessionStatus } from '../../shared/types'
import { SessionCard } from './components/SessionCard'
import { StatusBar } from './components/StatusBar'
import { useNow } from './hooks/useNow'
import { useSessions } from './hooks/useSessions'
import { useSystemMetrics } from './hooks/useSystemMetrics'
import { orderColumn } from './ordering'

const COLUMNS: Array<{ id: SessionStatus; title: string }> = [
  { id: 'running', title: '실행중' },
  { id: 'attention', title: '확인 필요' },
  { id: 'done', title: '완료' }
]

export default function App() {
  const cards = useSessions()
  const metrics = useSystemMetrics()
  const now = useNow(1000)
  const [showHidden, setShowHidden] = useState(false)

  const visible = cards.filter((c) => !c.dismissed)
  const hiddenCount = cards.length - visible.length
  const boardCards = showHidden ? cards : visible
  const running = visible.filter((c) => c.status === 'running').length
  const attention = visible.filter((c) => c.status === 'attention').length

  return (
    <div className="board">
      <header className="board-header">
        <h1>ccdeck</h1>
        <span className="header-meta num">
          세션 {visible.length} · 실행중 {running} · 확인필요 {attention}
        </span>
        {hiddenCount > 0 && (
          <button
            className={`hidden-toggle num${showHidden ? ' active' : ''}`}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? '숨김 접기' : `숨김 ${hiddenCount}`}
          </button>
        )}
      </header>
      <main className="columns">
        {COLUMNS.map((col) => {
          const list = orderColumn(boardCards, col.id)
          return (
            <section key={col.id} className={`column column-${col.id}`}>
              <h2>
                {col.title} <span className="count num">{list.length}</span>
              </h2>
              <div className="column-cards">
                {list.map((card) => (
                  <SessionCard key={card.filePath} card={card} now={now} />
                ))}
                {list.length === 0 && <p className="empty">비어 있음</p>}
              </div>
            </section>
          )
        })}
      </main>
      <StatusBar metrics={metrics} cards={visible} now={now} />
    </div>
  )
}
