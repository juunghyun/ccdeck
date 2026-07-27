import { describe, expect, it } from 'vitest'
import { TranscriptAccumulator } from './transcript'

// 합성 픽스처 — 실제 세션 데이터 사용 금지 (CLAUDE.md 데이터 규칙)
const BASE = {
  sessionId: 'sess-0001',
  cwd: '/tmp/demo-project',
  gitBranch: 'feature/demo',
  isSidechain: false
}

const USAGE = {
  input_tokens: 5,
  output_tokens: 100,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 50
}

function userLine(ts: string, content: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...BASE,
    type: 'user',
    timestamp: ts,
    message: { role: 'user', content },
    ...extra
  })
}

function assistantLine(
  ts: string,
  opts: {
    id?: string
    stop?: string | null
    blocks?: unknown[]
    usage?: Record<string, number>
    extra?: Record<string, unknown>
  } = {}
): string {
  return JSON.stringify({
    ...BASE,
    type: 'assistant',
    timestamp: ts,
    message: {
      id: opts.id ?? 'msg_001',
      model: 'claude-fable-5',
      stop_reason: opts.stop ?? 'tool_use',
      content: opts.blocks ?? [],
      usage: opts.usage ?? USAGE
    },
    ...opts.extra
  })
}

function feed(lines: string[]): TranscriptAccumulator {
  const acc = new TranscriptAccumulator()
  for (const line of lines) acc.addLine(line)
  return acc
}

describe('TranscriptAccumulator', () => {
  it('사용자 프롬프트가 턴을 열고 첫 프롬프트를 기록한다', () => {
    const acc = feed([userLine('2026-01-01T00:00:00.000Z', '테스트 기능 구현해줘')])
    const snap = acc.snapshot()
    expect(snap.turnOpen).toBe(true)
    expect(snap.firstPrompt).toBe('테스트 기능 구현해줘')
    expect(snap.turnStartedAt).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
    expect(snap.sessionId).toBe('sess-0001')
    expect(snap.cwd).toBe('/tmp/demo-project')
  })

  it('로컬 커맨드 출력 등 메타 라인은 프롬프트로 치지 않는다', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '<command-name>/model</command-name>'),
      userLine('2026-01-01T00:00:01.000Z', 'Caveat: the messages below...'),
      userLine('2026-01-01T00:00:02.000Z', 'x', { isMeta: true })
    ])
    const snap = acc.snapshot()
    expect(snap.firstPrompt).toBeNull()
    expect(snap.turnOpen).toBe(false)
  })

  it('assistant end_turn이 턴을 닫는다', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '질문 하나'),
      assistantLine('2026-01-01T00:00:10.000Z', {
        stop: 'end_turn',
        blocks: [{ type: 'text', text: '답변입니다' }]
      })
    ])
    const snap = acc.snapshot()
    expect(snap.turnOpen).toBe(false)
    expect(snap.turnStartedAt).toBeNull()
    expect(snap.lastAssistantText).toBe('답변입니다')
    expect(snap.model).toBe('claude-fable-5')
  })

  it('같은 message.id로 쪼개진 라인들의 usage는 한 번만 집계한다', () => {
    const acc = feed([
      assistantLine('2026-01-01T00:00:10.000Z', { id: 'msg_a', blocks: [{ type: 'thinking' }] }),
      assistantLine('2026-01-01T00:00:11.000Z', {
        id: 'msg_a',
        blocks: [{ type: 'text', text: 'hi' }]
      }),
      assistantLine('2026-01-01T00:00:12.000Z', { id: 'msg_b' })
    ])
    const snap = acc.snapshot()
    expect(snap.tokens.output).toBe(200) // msg_a 1회 + msg_b 1회
    expect(snap.tokens.cacheRead).toBe(2000)
  })

  it('Agent tool_use는 tool_result가 올 때까지 활성 서브에이전트로 잡힌다', () => {
    const spawn = assistantLine('2026-01-01T00:00:10.000Z', {
      blocks: [
        { type: 'tool_use', id: 'tu_1', name: 'Agent', input: { description: '버그 탐색 에이전트' } }
      ]
    })
    const acc = feed([userLine('2026-01-01T00:00:00.000Z', '버그 찾아줘'), spawn])
    expect(acc.snapshot().pendingToolUses).toEqual([
      { id: 'tu_1', name: 'Agent', description: '버그 탐색 에이전트', startedAt: Date.parse('2026-01-01T00:00:10.000Z') }
    ])

    acc.addLine(
      userLine('2026-01-01T00:05:00.000Z', [{ type: 'tool_result', tool_use_id: 'tu_1' }])
    )
    expect(acc.snapshot().pendingToolUses).toEqual([])
  })

  it('AskUserQuestion 대기가 pending으로 노출된다', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '뭐 먼저 할까'),
      assistantLine('2026-01-01T00:00:10.000Z', {
        blocks: [{ type: 'tool_use', id: 'tu_q', name: 'AskUserQuestion', input: {} }]
      })
    ])
    const names = acc.snapshot().pendingToolUses.map((t) => t.name)
    expect(names).toContain('AskUserQuestion')
    expect(acc.snapshot().turnOpen).toBe(true)
  })

  it('cwd는 최초값이 고정된다 (셸 cd를 따라가지 않음 — 프로세스 매칭 키)', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '작업 시작'),
      JSON.stringify({
        ...BASE,
        cwd: '/tmp/demo-project/subdir',
        type: 'user',
        timestamp: '2026-01-01T00:01:00.000Z',
        message: { role: 'user', content: '다음 작업' }
      })
    ])
    expect(acc.snapshot().cwd).toBe('/tmp/demo-project')
  })

  it('ai-title 엔트리가 세션 제목이 된다', () => {
    const acc = feed([
      JSON.stringify({ type: 'ai-title', sessionId: 'sess-0001', aiTitle: '데모 기능 구현' })
    ])
    expect(acc.snapshot().title).toBe('데모 기능 구현')
  })

  it('인터럽트는 턴을 닫고 대기 툴을 정리한다', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '작업 시작'),
      assistantLine('2026-01-01T00:00:10.000Z', {
        blocks: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} }]
      }),
      userLine('2026-01-01T00:00:20.000Z', '[Request interrupted by user]')
    ])
    const snap = acc.snapshot()
    expect(snap.turnOpen).toBe(false)
    expect(snap.pendingToolUses).toEqual([])
  })

  it('sidechain(서브에이전트) 대화는 토큰만 집계하고 턴 상태는 건드리지 않는다', () => {
    const acc = feed([
      userLine('2026-01-01T00:00:00.000Z', '메인 작업'),
      assistantLine('2026-01-01T00:00:10.000Z', {
        id: 'msg_side',
        stop: 'end_turn',
        blocks: [{ type: 'text', text: '사이드체인 응답' }],
        extra: { isSidechain: true }
      })
    ])
    const snap = acc.snapshot()
    expect(snap.turnOpen).toBe(true) // 메인 턴은 여전히 열림
    expect(snap.lastAssistantText).toBeNull()
    expect(snap.tokens.output).toBe(100) // 토큰은 집계됨
  })
})
