/* Строки экрана «Сегодня»: не перекрывают ключи основного словаря и не теряют ни одного языка */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { S_TODAY } from './strings.today'

const OTHER = ['./i18n.ts', './strings.speed.ts', './strings.flow.ts', './strings.rite.ts', './strings.journey.ts']
  .map(f => { try { return readFileSync(new URL(f, import.meta.url), 'utf8') } catch { return '' } }).join('\n')
const otherKeys = new Set([...OTHER.matchAll(/(?<=^|[\s,{])'([^'\n]+)':\s*\[/gm)].map(m => m[1]))

describe('S_TODAY', () => {
  test('ключи с префиксом today. и не повторяют ключи других словарей (повтор молча перезаписал бы чужую строку)', () => {
    const keys = Object.keys(S_TODAY)
    expect(keys.length).toBeGreaterThan(20)
    expect(keys.filter(k => !k.startsWith('today.'))).toEqual([])
    expect(keys.filter(k => otherKeys.has(k))).toEqual([])
  })
  test('ключи внутри файла не повторяются', () => {
    const src = readFileSync(new URL('./strings.today.ts', import.meta.url), 'utf8')
    const keys = [...src.matchAll(/(?<=^|[\s,{])'([^'\n]+)':\s*\[/gm)].map(m => m[1])
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })
  test('все дни недели и 12 месяцев хиджры', () => {
    for (let i = 1; i <= 7; i++) expect(S_TODAY['today.wd.' + i]).toBeDefined()
    for (let i = 1; i <= 12; i++) expect(S_TODAY['today.hm.' + i]).toBeDefined()
  })
})
