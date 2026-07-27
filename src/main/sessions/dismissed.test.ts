import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DismissedStore } from './dismissed'

const tmpDirs: string[] = []

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccdeck-test-'))
  tmpDirs.push(dir)
  return path.join(dir, 'dismissed.json')
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('DismissedStore', () => {
  it('set/persist 후 새 인스턴스에서 로드된다', () => {
    const file = tmpFile()
    const store = new DismissedStore(file)
    store.set('sess-1', true)
    store.set('sess-2', true)
    store.set('sess-2', false)

    const reloaded = new DismissedStore(file)
    reloaded.load()
    expect(reloaded.has('sess-1')).toBe(true)
    expect(reloaded.has('sess-2')).toBe(false)
    expect(reloaded.count()).toBe(1)
  })

  it('30일 지난 항목은 로드 시 정리된다', () => {
    const file = tmpFile()
    const now = Date.now()
    const store = new DismissedStore(file)
    store.set('old', true, now - 31 * 24 * 3600_000)
    store.set('fresh', true, now)

    const reloaded = new DismissedStore(file)
    reloaded.load(now)
    expect(reloaded.has('old')).toBe(false)
    expect(reloaded.has('fresh')).toBe(true)
  })

  it('파일이 없거나 손상돼도 빈 상태로 시작한다', () => {
    const file = tmpFile()
    const store = new DismissedStore(file)
    store.load()
    expect(store.count()).toBe(0)

    fs.writeFileSync(file, 'not-json')
    const corrupted = new DismissedStore(file)
    corrupted.load()
    expect(corrupted.count()).toBe(0)
  })
})
