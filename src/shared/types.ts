export type SessionStatus = 'running' | 'attention' | 'done'

export type AttentionReason = 'question' | 'turn-ended' | 'stalled' | 'idle'

export interface TokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface SubagentInfo {
  active: number
  names: string[]
}

/** Claude 모델 컨텍스트 윈도우 (토큰) — 게이지 분모 */
export const CONTEXT_WINDOW_TOKENS = 200_000

export interface ContextInfo {
  tokens: number
  percent: number
}

export interface ProcessInfo {
  pid: number
  rssBytes: number
  /** 같은 cwd에 세션이 프로세스보다 많아 매칭이 모호한 경우 */
  shared: boolean
}

export interface SystemMetrics {
  memory: {
    totalBytes: number
    /** Activity Monitor 방식 근사치: active + wired + compressed */
    usedBytes: number
    compressedBytes: number
    swapUsedBytes: number
  }
  cpu: {
    usagePercent: number
    loadAvg1: number
  }
  claude: {
    processCount: number
    rssBytes: number
  }
  sampledAt: number
}

export interface SessionCardData {
  sessionId: string
  filePath: string
  cwd: string
  projectName: string
  gitBranch: string | null
  status: SessionStatus
  attentionReason: AttentionReason | null
  title: string | null
  firstPrompt: string | null
  lastAssistantText: string | null
  model: string | null
  sessionStartedAt: number | null
  turnStartedAt: number | null
  lastActivityAt: number
  tokens: TokenTotals
  context: ContextInfo | null
  subagents: SubagentInfo
  process: ProcessInfo | null
}
