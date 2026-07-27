import { describe, expect, it } from 'vitest'
import { CpuSampler, parseSwapUsedBytes, parseVmStat } from './metrics'

// 합성 픽스처 — 실제 시스템 출력 캡처 아님
const VM_STAT_FIXTURE = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12345.
Pages active:                            100000.
Pages inactive:                           80000.
Pages speculative:                         5000.
Pages throttled:                              0.
Pages wired down:                         50000.
Pages purgeable:                           2000.
"Translation faults":                 987654321.
Pages occupied by compressor:             30000.
Pages stored in compressor:               90000.
`

describe('parseVmStat', () => {
  it('페이지 크기와 페이지 카운트를 파싱한다', () => {
    const { pageSize, pages } = parseVmStat(VM_STAT_FIXTURE)
    expect(pageSize).toBe(16384)
    expect(pages['Pages active']).toBe(100000)
    expect(pages['Pages wired down']).toBe(50000)
    expect(pages['Pages occupied by compressor']).toBe(30000)
    expect(pages['Translation faults']).toBe(987654321)
  })
})

describe('parseSwapUsedBytes', () => {
  it('M 단위 used 값을 바이트로 변환한다', () => {
    const line = 'total = 2048.00M  used = 532.75M  free = 1515.25M  (encrypted)'
    expect(parseSwapUsedBytes(line)).toBe(Math.round(532.75 * 1024 * 1024))
  })

  it('G 단위도 처리한다', () => {
    expect(parseSwapUsedBytes('total = 4.00G  used = 1.50G  free = 2.50G')).toBe(
      Math.round(1.5 * 1024 ** 3)
    )
  })

  it('스왑이 없으면 0', () => {
    expect(parseSwapUsedBytes('')).toBe(0)
  })
})

describe('CpuSampler', () => {
  it('0~100 범위의 사용률을 반환한다', () => {
    const sampler = new CpuSampler()
    const value = sampler.sample()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)
  })
})
