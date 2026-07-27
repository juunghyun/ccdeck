import fs from 'node:fs'
import path from 'node:path'

const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 사용자가 보드에서 닫은(추적 제외) 세션 ID 저장소.
 * 세션 ID는 재사용되지 않으므로 영구 숨김이 안전하고,
 * 30일 지난 항목은 로드 시 정리한다 (트랜스크립트도 그 전에 사라짐).
 */
export class DismissedStore {
  private ids = new Map<string, number>()

  constructor(private readonly filePath: string) {}

  load(now = Date.now()): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as {
        ids?: Record<string, unknown>
      }
      if (raw?.ids && typeof raw.ids === 'object') {
        for (const [id, at] of Object.entries(raw.ids)) {
          if (typeof at === 'number' && now - at <= PRUNE_AGE_MS) this.ids.set(id, at)
        }
      }
    } catch {
      // 파일 없음/손상 → 빈 상태로 시작
    }
  }

  has(sessionId: string): boolean {
    return this.ids.has(sessionId)
  }

  count(): number {
    return this.ids.size
  }

  set(sessionId: string, dismissed: boolean, now = Date.now()): void {
    if (dismissed) this.ids.set(sessionId, now)
    else this.ids.delete(sessionId)
    this.persist()
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ version: 1, ids: Object.fromEntries(this.ids) })
      )
    } catch {
      // 저장 실패는 치명적이지 않음 — 다음 set에서 재시도
    }
  }
}
