import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const MAX_BUFFER = 16 * 1024 * 1024

export interface ClaudeProcess {
  pid: number
  rssBytes: number
  elapsedMs: number
  cwd: string | null
}

/**
 * 실행 중인 claude CLI 프로세스를 나열하고 lsof로 각 프로세스의 cwd를 붙인다.
 * argv[0]의 basename이 정확히 'claude'인 것만 매칭 —
 * Claude 데스크톱 앱('Claude', 'Claude Helper')은 대소문자로 걸러진다.
 */
export async function listClaudeProcesses(): Promise<ClaudeProcess[]> {
  let stdout: string
  try {
    ;({ stdout } = await exec('ps', ['-axo', 'pid=,rss=,etime=,command='], { maxBuffer: MAX_BUFFER }))
  } catch {
    return []
  }

  const procs: ClaudeProcess[] = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    if (!m) continue
    const argv0 = m[4].split(' ')[0]
    const base = argv0.split('/').pop()
    if (base !== 'claude') continue
    procs.push({
      pid: Number(m[1]),
      rssBytes: Number(m[2]) * 1024,
      elapsedMs: parseEtime(m[3]),
      cwd: null
    })
  }
  if (procs.length === 0) return procs

  const byPid = new Map(procs.map((p) => [p.pid, p]))
  let lsofOut = ''
  try {
    ;({ stdout: lsofOut } = await exec(
      'lsof',
      ['-a', '-p', procs.map((p) => p.pid).join(','), '-d', 'cwd', '-Fn'],
      { maxBuffer: MAX_BUFFER }
    ))
  } catch (err) {
    // 일부 pid가 그 사이 종료되면 lsof가 nonzero로 끝나지만 stdout은 유효하다
    const e = err as { stdout?: unknown }
    if (typeof e.stdout === 'string') lsofOut = e.stdout
  }
  let current: ClaudeProcess | undefined
  for (const line of lsofOut.split('\n')) {
    if (line.startsWith('p')) current = byPid.get(Number(line.slice(1)))
    else if (line.startsWith('n') && current) current.cwd = line.slice(1)
  }
  return procs
}

/** kill 직전 재검증 — pid 재사용으로 엉뚱한 프로세스를 죽이지 않도록 */
export async function isClaudePid(pid: number): Promise<boolean> {
  const procs = await listClaudeProcesses()
  return procs.some((p) => p.pid === pid)
}

/** ps etime 포맷 [[dd-]hh:]mm:ss 파싱 */
export function parseEtime(value: string): number {
  const m = value.match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/)
  if (!m) return 0
  const [, dd, hh, mm, ss] = m
  return (
    (Number(dd ?? 0) * 86400 + Number(hh ?? 0) * 3600 + Number(mm) * 60 + Number(ss)) * 1000
  )
}
