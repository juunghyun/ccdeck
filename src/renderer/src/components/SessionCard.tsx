import type { AttentionReason, SessionCardData } from '../../../shared/types'
import { formatDuration, formatRss, formatTokens, shortModel, timeAgo } from '../format'
import { agingLevel } from '../ordering'

function contextTone(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warn'
  return 'ok'
}

const REASON_LABEL: Record<AttentionReason, string> = {
  question: '질문 대기',
  'turn-ended': '턴 종료 — 확인 필요',
  stalled: '응답 정지 추정',
  idle: '입력 대기'
}

export function SessionCard({ card, now }: { card: SessionCardData; now: number }) {
  const aging = agingLevel(card, now)
  return (
    <article className={`session-card status-${card.status} aging-${aging}`}>
      <div className="card-top">
        <span className="project" title={card.cwd}>
          {card.projectName}
        </span>
        {card.gitBranch && (
          <span className="branch" title={card.gitBranch}>
            {card.gitBranch}
          </span>
        )}
        {card.process && (
          <button
            className="kill-btn"
            title="claude 프로세스 종료 (확인 후 진행)"
            onClick={() =>
              void window.ccdeck.killSession(
                card.process!.pid,
                `${card.projectName} — ${card.title ?? card.firstPrompt ?? card.sessionId.slice(0, 8)}`
              )
            }
          >
            종료
          </button>
        )}
      </div>

      <h3 className="card-title" title={card.firstPrompt ?? undefined}>
        {card.title ?? card.firstPrompt ?? '(제목 없음)'}
      </h3>

      <div className="card-status-line">
        {card.status === 'running' && (
          <span className="status-label running num">
            실행중{card.turnStartedAt ? ` · ${formatDuration(now - card.turnStartedAt)}` : ''}
          </span>
        )}
        {card.status === 'attention' && (
          <span className="status-label attention num">
            {REASON_LABEL[card.attentionReason ?? 'turn-ended']} ·{' '}
            {timeAgo(now - card.lastActivityAt)}
          </span>
        )}
        {card.status === 'done' && (
          <span className="status-label done num">종료 · {timeAgo(now - card.lastActivityAt)}</span>
        )}
        {card.subagents.active > 0 && (
          <span className="subagents" title={card.subagents.names.join('\n')}>
            서브에이전트 {card.subagents.active}
          </span>
        )}
      </div>

      {card.context && (
        <div className={`context-gauge tone-${contextTone(card.context.percent)}`}>
          <span className="context-label num">컨텍스트 {Math.round(card.context.percent)}%</span>
          <span className="context-track">
            <span className="context-fill" style={{ width: `${card.context.percent}%` }} />
          </span>
        </div>
      )}

      {card.lastAssistantText && <p className="card-snippet">{card.lastAssistantText}</p>}

      <div className="card-meta num">
        {card.process && (
          <span title={card.process.shared ? '같은 경로에 세션이 여러 개라 추정치' : undefined}>
            {formatRss(card.process.rssBytes)}
            {card.process.shared ? '±' : ''}
          </span>
        )}
        <span>out {formatTokens(card.tokens.output)}</span>
        {card.model && <span>{shortModel(card.model)}</span>}
        <span>{card.sessionId.slice(0, 8)}</span>
      </div>
    </article>
  )
}
