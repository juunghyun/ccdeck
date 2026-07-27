import fs from 'node:fs/promises'
import path from 'node:path'

export async function findRecentTranscriptFiles(
  root: string,
  windowMs: number,
  now = Date.now()
): Promise<string[]> {
  let dirs: string[]
  try {
    dirs = await fs.readdir(root)
  } catch {
    return []
  }
  const files: string[] = []
  for (const dir of dirs) {
    const dirPath = path.join(root, dir)
    let entries: string[]
    try {
      entries = await fs.readdir(dirPath)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue
      const filePath = path.join(dirPath, name)
      try {
        const stat = await fs.stat(filePath)
        if (now - stat.mtimeMs <= windowMs) files.push(filePath)
      } catch {
        // 스캔 중 파일 삭제 경합은 무시
      }
    }
  }
  return files
}

export interface TailReadResult {
  lines: string[]
  truncated: boolean
}

/**
 * JSONL 파일을 바이트 오프셋 기준으로 증분 읽기한다.
 * 줄 분리는 버퍼 레벨(0x0A)에서 수행해 청크 경계의 멀티바이트 한글이 깨지지 않게 한다.
 * 파일이 줄어들면(truncate) 처음부터 다시 읽고 truncated를 알린다.
 */
export class TranscriptTailReader {
  private offset = 0
  private remainder: Buffer = Buffer.alloc(0)

  constructor(readonly filePath: string) {}

  async readNew(): Promise<TailReadResult> {
    let size: number
    try {
      ;({ size } = await fs.stat(this.filePath))
    } catch {
      return { lines: [], truncated: false }
    }

    let truncated = false
    if (size < this.offset) {
      this.offset = 0
      this.remainder = Buffer.alloc(0)
      truncated = true
    }
    if (size === this.offset) return { lines: [], truncated }

    const length = size - this.offset
    const buf = Buffer.alloc(length)
    const fh = await fs.open(this.filePath, 'r')
    try {
      await fh.read(buf, 0, length, this.offset)
    } finally {
      await fh.close()
    }
    this.offset = size

    const data = this.remainder.length ? Buffer.concat([this.remainder, buf]) : buf
    const lines: string[] = []
    let start = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0x0a) {
        lines.push(data.subarray(start, i).toString('utf8'))
        start = i + 1
      }
    }
    this.remainder = Buffer.from(data.subarray(start))
    return { lines, truncated }
  }
}
