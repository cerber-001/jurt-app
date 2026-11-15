// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { h, render } from 'preact'
import { PROGRAM } from '../../tests/fixtures/program'

/* Демо-время читается из ?at= один раз при загрузке модуля, поэтому модуль грузим заново для каждого адреса. */
async function useNowAt(search: string): Promise<{ now: Date; demo: boolean }> {
  vi.resetModules()
  history.replaceState(null, '', '/' + search)
  const clock = await import('./clock')
  let now = new Date(0)
  const Probe = () => { now = clock.useNow(PROGRAM); return null }
  const box = document.createElement('div')
  render(h(Probe, null), box)
  await new Promise(r => setTimeout(r, 120))     // дать хукам Preact отработать до выхода из теста
  render(null, box)
  return { now, demo: clock.demo }
}

afterEach(() => { history.replaceState(null, '', '/') })

describe('демо-время ?at=', () => {
  test('без параметра — настоящие часы', async () => {
    const { now, demo } = await useNowAt('')
    expect(demo).toBe(false)
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(2000)
  })

  test('дата и время трактуются как стенные часы города программы (UTC+5 у первого дня)', async () => {
    const { now, demo } = await useNowAt('?at=2026-11-01T22:30')
    expect(demo).toBe(true)
    expect(Math.abs(now.getTime() - Date.parse('2026-11-01T17:30:00Z'))).toBeLessThan(2000)
  })

  test('день без времени — полдень по поясу этого дня (UTC+3 у второго дня)', async () => {
    const { now } = await useNowAt('?at=2026-11-02')
    expect(Math.abs(now.getTime() - Date.parse('2026-11-02T09:00:00Z'))).toBeLessThan(2000)
  })

  test('мусор в параметре — демо включено, но время настоящее', async () => {
    const { now, demo } = await useNowAt('?at=вчера')
    expect(demo).toBe(true)
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(2000)
  })
})
