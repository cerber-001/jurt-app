/* «Мой путь» и режим приложения: чистые расчёты (режим, отсчёт, формы слов, сроки дел, отметки, заявка) */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import {
  PREP_DAYS, PREP_IDS, countdown, daysWord, dueDate, fmtFull, leadText, leadUrl, modeOf, ownProgram, plural, readPrep, readTrip,
  savePrep, saveTrip, savedProgram, togglePrep, tripOf,
} from './journey'
import { lang } from './store'
import type { Program } from './program'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals(); lang.value = 'ru' })

/** Программа из дней с датами; пояс UTC+3, у дня один пункт на весь день */
function prog(dates: string[]): Program {
  return {
    title: '', subtitle: '', group: '', updated: '', version: '', legend: [], incl: [], excl: [], pay_rule: '', decisions: null,
    days: dates.map((date, k) => ({ id: 'd' + k, date, city: 'Мекка', tz: 'UTC+3', items: [{ t: '08:00', w: 'Завтрак' }] })),
  }
}
/** Момент «в этот день в 12:00 по UTC+3» */
const at = (iso: string) => new Date(iso + 'T09:00:00Z')

describe('режим приложения', () => {
  const p = prog(['2026-12-01', '2026-12-02', '2026-12-03'])

  test('нет программы — «каждый день»', () => {
    expect(modeOf(null, true, at('2026-12-02'))).toBe('everyday')
  })

  test('есть программа, но нет данных группы — «каждый день»', () => {
    expect(modeOf(p, false, at('2026-12-02'))).toBe('everyday')
  })

  test('до поездки и после неё — «каждый день»', () => {
    expect(modeOf(p, true, at('2026-11-20'))).toBe('everyday')
    expect(modeOf(p, true, at('2026-12-10'))).toBe('everyday')
  })

  test('день поездки — «поездка»', () => {
    expect(modeOf(p, true, at('2026-12-01'))).toBe('trip')
    expect(modeOf(p, true, at('2026-12-03'))).toBe('trip')
  })

  test('промежуток между днями программы — тоже «поездка»', () => {
    const gap = prog(['2026-12-01', '2026-12-04'])
    expect(modeOf(gap, true, at('2026-12-02'))).toBe('trip')
  })

  test('сохранённая копия программы читается без сети; испорченная — как будто её нет', () => {
    expect(savedProgram()).toBeNull()
    localStorage.setItem('jurt.program', JSON.stringify({ at: 1, raw: p }))
    expect(savedProgram()?.days[0].date).toBe('2026-12-01')
    localStorage.setItem('jurt.program', '{испорчено')
    expect(savedProgram()).toBeNull()
    localStorage.setItem('jurt.program', JSON.stringify({ at: 1, raw: { days: [] } }))
    expect(savedProgram()).toBeNull()
  })
})

describe('своя или чужая программа (поле code)', () => {
  const p = prog(['2026-11-20'])
  test('кода в программе нет — сверить нечем, программа остаётся', () => {
    expect(ownProgram(p, 'UMRA-0009')).toBe(p)
  })
  test('код совпал (без учёта регистра) — своя; не совпал — чужая (null)', () => {
    expect(ownProgram({ ...p, code: 'umra-0009' }, 'UMRA-0009')).not.toBeNull()
    expect(ownProgram({ ...p, code: 'UMRA-0010' }, 'UMRA-0009')).toBeNull()
  })
  test('код паломника неизвестен (демо ?at=) или код в программе не похож на код — программа остаётся', () => {
    expect(ownProgram({ ...p, code: 'UMRA-0010' }, '')).not.toBeNull()
    expect(ownProgram({ ...p, code: 'что-то' }, 'UMRA-0009')).not.toBeNull()
    expect(ownProgram(null, 'UMRA-0009')).toBeNull()
  })
})

describe('отсчёт до поездки', () => {
  test('до поездки — число дней', () => {
    expect(countdown('2027-02-01', '2027-02-01', '2026-11-19')).toEqual({ kind: 'before', days: 74 })
    expect(countdown('2026-11-21', '2026-11-21', '2026-11-20')).toEqual({ kind: 'before', days: 1 })
  })

  test('в день вылета — «сегодня»', () => {
    expect(countdown('2026-11-20', '2026-11-20', '2026-11-20').kind).toBe('today')
  })

  test('между первым и последним днём программы — «в пути»', () => {
    expect(countdown('2026-11-18', '2026-11-25', '2026-11-20').kind).toBe('during')
  })

  test('после — «с возвращением»', () => {
    expect(countdown('2026-11-01', '2026-11-01', '2026-11-20').kind).toBe('after')
    expect(countdown('2026-11-01', '2026-11-10', '2026-11-20').kind).toBe('after')
  })
})

describe('формы слова «день»', () => {
  test.each([[1, 'one'], [2, 'few'], [4, 'few'], [5, 'many'], [11, 'many'], [12, 'many'], [14, 'many'], [21, 'one'], [22, 'few'], [74, 'few'], [100, 'many'], [111, 'many'], [101, 'one']] as const)(
    'ru: %i — %s', (n, f) => { expect(plural(n, 'ru')).toBe(f) })

  test('по-русски: день, дня, дней', () => {
    expect(daysWord(1)).toBe('1 день')
    expect(daysWord(3)).toBe('3 дня')
    expect(daysWord(74)).toBe('74 дня')
    expect(daysWord(11)).toBe('11 дней')
    expect(daysWord(25)).toBe('25 дней')
  })

  test('по-казахски слово после числа не меняется: «74 күн»', () => {
    lang.value = 'kk'
    expect(daysWord(1)).toBe('1 күн')
    expect(daysWord(74)).toBe('74 күн')
    expect(daysWord(11)).toBe('11 күн')
  })

  test('по-английски: day, days', () => {
    lang.value = 'en'
    expect(daysWord(1)).toBe('1 day')
    expect(daysWord(2)).toBe('2 days')
  })

  test('полная дата ДД.ММ.ГГГГ', () => {
    expect(fmtFull('2027-02-01')).toBe('01.02.2027')
    lang.value = 'kk'; expect(fmtFull('2027-02-01')).toBe('01.02.2027')
    lang.value = 'en'; expect(fmtFull('2027-02-01')).toBe('1 Feb 2027')
    expect(fmtFull('мусор')).toBe('мусор')
  })
})

describe('дата поездки', () => {
  test('по программе группы — первый и последний день, пока поездка не закончилась', () => {
    const p = prog(['2027-02-01', '2027-02-10'])
    expect(tripOf(p, true, '', '2026-11-20')).toEqual({ start: '2027-02-01', end: '2027-02-10', fromProgram: true })
  })

  test('без данных группы программа не считается своей — берётся дата, указанная вручную', () => {
    const p = prog(['2027-02-01'])
    expect(tripOf(p, false, '2027-03-05', '2026-11-20')).toEqual({ start: '2027-03-05', end: '2027-03-05', fromProgram: false })
    expect(tripOf(null, false, '', '2026-11-20')).toBeNull()
  })

  test('поездка по программе закончилась — новая дата вручную важнее', () => {
    const p = prog(['2026-10-01', '2026-10-10'])
    expect(tripOf(p, true, '2027-03-05', '2026-11-20')?.start).toBe('2027-03-05')
    expect(tripOf(p, true, '', '2026-11-20')).toEqual({ start: '2026-10-01', end: '2026-10-10', fromProgram: true })
  })

  test('дата хранится на телефоне (jurt.trip); не-дата не принимается; пустая — очищает', () => {
    expect(readTrip()).toBe('')
    saveTrip('2027-02-01')
    expect(localStorage.getItem('jurt.trip')).toBe('2027-02-01')
    expect(readTrip()).toBe('2027-02-01')
    localStorage.setItem('jurt.trip', 'завтра')
    expect(readTrip()).toBe('')
    saveTrip('')
    expect(localStorage.getItem('jurt.trip')).toBeNull()
  })
})

describe('подготовка по дням', () => {
  test('шесть дел в порядке макета', () => {
    expect(PREP_IDS).toEqual(['lessons', 'docs', 'talbiya', 'ihram', 'pack', 'amanat'])
  })

  test('сроки относительно даты поездки: документы за 30, тальбия за 14, ихрам за 7, сборы за 5, дуа близких за 2', () => {
    const due = (id: typeof PREP_IDS[number]) => dueDate('2027-02-01', PREP_DAYS[id])
    expect(due('docs')).toBe('2027-01-02')
    expect(due('talbiya')).toBe('2027-01-18')
    expect(due('ihram')).toBe('2027-01-25')
    expect(due('pack')).toBe('2027-01-27')
    expect(due('amanat')).toBe('2027-01-30')
    expect(due('lessons')).toBe('2027-02-01')
  })

  test('отметка не меняет прежний объект, хранится в jurt.prep и читается обратно', () => {
    const a = readPrep()
    expect(a).toEqual({})
    const b = togglePrep(a, 'talbiya')
    expect(a).toEqual({})
    expect(b).toEqual({ talbiya: true })
    savePrep(b)
    expect(JSON.parse(localStorage.getItem('jurt.prep')!)).toEqual({ talbiya: true })
    expect(readPrep()).toEqual({ talbiya: true })
    expect(togglePrep(b, 'talbiya')).toEqual({})
  })

  test('испорченные отметки и чужие ключи отбрасываются', () => {
    localStorage.setItem('jurt.prep', '{"talbiya":true,"evil":true,"docs":"да"}')
    expect(readPrep()).toEqual({ talbiya: true })
    localStorage.setItem('jurt.prep', 'не json')
    expect(readPrep()).toEqual({})
  })
})

describe('«Хочу поехать»', () => {
  test('ссылка WhatsApp — только цифры номера и закодированный текст', () => {
    expect(leadUrl('+7 (700) 000-00-00', 'Привет & да')).toBe('https://wa.me/77000000000?text=' + encodeURIComponent('Привет & да'))
  })

  test('без номера (или не номер) — ссылки нет', () => {
    expect(leadUrl(undefined, 'x')).toBeNull()
    expect(leadUrl('', 'x')).toBeNull()
    expect(leadUrl('abc', 'x')).toBeNull()
  })

  test('текст заявки: приветствие и месяц поездки, если указан', () => {
    expect(leadText('')).toBe('Ассаляму алейкум! Хочу поехать на умру.')
    expect(leadText('2027-02-01')).toBe('Ассаляму алейкум! Хочу поехать на умру. Желаемый месяц: февраль 2027.')
    lang.value = 'kk'
    expect(leadText('2027-02-01')).toContain('ақпан 2027')
  })
})
