// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { groupCodeOrEmpty, isGroupCode } from './codes'

describe('код группы', () => {
  test('буквы, дефис, 3–5 цифр', () => {
    for (const ok of ['UMRA-0010', 'umra-123', 'A-12345']) expect(isGroupCode(ok), ok).toBe(true)
    for (const bad of ['UMRA-12', 'UMRA-123456', 'UMRA0010', 'UMRA-0010)', 'UMRA-0010,x', 'УМРА-0010', ' UMRA-0010', '']) {
      expect(isGroupCode(bad), bad).toBe(false)
    }
  })
  test('groupCodeOrEmpty: заглавными, пробелы по краям убирает, мусор — пустая строка', () => {
    expect(groupCodeOrEmpty(' umra-0010 ')).toBe('UMRA-0010')
    expect(groupCodeOrEmpty('x),id.neq.0')).toBe('')
    expect(groupCodeOrEmpty(null)).toBe('')
  })
})

describe('readUrlCodes — ?g= из адреса', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { history.replaceState(null, '', '/'); vi.unstubAllGlobals() })

  test('настоящий код берётся, не похожее на код — молча пропускается', async () => {
    const { groupCode, readUrlCodes } = await import('./store')
    groupCode.value = ''
    history.replaceState(null, '', '/?g=umra-0010')
    readUrlCodes()
    expect(groupCode.value).toBe('UMRA-0010')
    history.replaceState(null, '', '/?g=' + encodeURIComponent('X),trip_code.neq.0'))
    readUrlCodes()
    expect(groupCode.value).toBe('UMRA-0010')
  })
})
