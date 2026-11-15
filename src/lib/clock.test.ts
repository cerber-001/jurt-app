import { describe, expect, test } from 'vitest'
import { leftText, slots, stepFor, tzNow, tzOf, wall, where, type Phase } from './clock'
import type { Program, ProgramDay, ProgramItem } from './program'
import { at, DAY_DEPART, DAY_FLIGHT, DAY_MECCA, DAY_MEDINA, PROGRAM, PROGRAM_DEPART } from '../../tests/fixtures/program'

const day = (p: Phase) => {
  if (p.kind !== 'day') throw new Error('ожидалась фаза day, получена ' + p.kind)
  return p
}

describe('tzOf', () => {
  test.each([['UTC+3', 3], ['UTC+5', 5], ['UTC-4', -4], ['utc +5.5', 5.5], ['UTC +3 (Мекка)', 3]])(
    '«%s» → %d', (tz, expected) => {
      expect(tzOf({ ...DAY_MECCA, tz })).toBe(expected)
    })
  test('без пояса или с чужим форматом — запасное значение', () => {
    expect(tzOf(undefined)).toBe(3)
    expect(tzOf({ ...DAY_MECCA, tz: undefined }, 5)).toBe(5)
    expect(tzOf({ ...DAY_MECCA, tz: 'GMT+3' })).toBe(3)
  })
})

describe('wall', () => {
  test('переводит момент в стенные часы пояса', () => {
    expect(wall(new Date('2026-11-01T20:00:00Z'), 5)).toEqual({ iso: '2026-11-02', min: 60 })
    expect(wall(new Date('2026-11-01T20:00:00Z'), 3)).toEqual({ iso: '2026-11-01', min: 23 * 60 })
  })
  test('отрицательный пояс уводит на предыдущие сутки', () => {
    expect(wall(new Date('2026-11-01T02:30:00Z'), -4)).toEqual({ iso: '2026-10-31', min: 22 * 60 + 30 })
  })
})

describe('slots', () => {
  test('точные пункты: начало — первое время, конец — начало следующего пункта', () => {
    const s = slots(DAY_FLIGHT)
    expect(s.map(x => [x.s, x.e])).toEqual([[360, 510], [510, 1330], [1330, 1545]])
    expect(s.map(x => x.exact)).toEqual([true, true, false])
  })

  test('диапазон «06:15 → 10:35» даёт и начало, и конец', () => {
    const s = slots({ ...DAY_MECCA, items: [{ t: '06:15 → 10:35', w: 'Переезд' }, { t: '12:00', w: 'Обед' }] })
    expect(s[0]).toMatchObject({ s: 375, e: 635, exact: true })
  })

  test('конец раньше начала означает переход через полночь', () => {
    const [flight] = slots({ ...DAY_FLIGHT, items: [{ t: '≈22:10–01:45', w: 'Рейс' }] }).slice(-1)
    expect(flight).toMatchObject({ s: 1330, e: 105 + 1440, exact: false })
  })

  test('пункт после полуночи («00:20») уходит за 1440', () => {
    const s = slots(DAY_MEDINA)
    const last = s[s.length - 1]
    expect(last.s).toBe(20 + 1440)
    expect(last.e).toBe(20 + 1440 + 120)   // последний пункт без конца длится 2 часа
  })

  test('слова вместо времени: Фаджр, после зухра, вечер', () => {
    const s = slots(DAY_MEDINA)
    expect(s[0].s).toBe(300)
    expect(s[0].e).toBe(480)      // до «08:00»
    expect(s[2].s).toBe(790)
    expect(s[3].s).toBe(1110)
    expect(s.slice(0, 4).filter(x => x.i.t === 'Фаджр' || x.i.t === 'Вечер').every(x => !x.exact)).toBe(true)
  })

  test('«до 11:00» — это только конец, начало выводится за час до конца', () => {
    const s = slots({ ...DAY_MECCA, items: [{ t: '08:00', w: 'Выезд' }, { t: 'до 11:00', w: 'Регистрация' }, { t: '12:00', w: 'Обед' }] })
    expect(s[1]).toMatchObject({ s: 600, e: 660, exact: false })
  })

  test('пункт без времени встаёт не раньше предыдущего', () => {
    const s = slots({ ...DAY_MECCA, items: [{ t: '09:00', w: 'Выезд' }, { t: '', w: 'Свободно' }, { t: '12:00', w: 'Обед' }] })
    expect(s[1].s).toBe(540)
    expect(s[1].e).toBe(720)
  })

  test('время начала никогда не убывает', () => {
    const starts = slots(DAY_MEDINA).map(x => x.s)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  test('пустой день даёт пустой список', () => {
    expect(slots({ ...DAY_MECCA, items: [] })).toEqual([])
  })
})

describe('where', () => {
  test('до поездки: считает дни до первого дня по поясу первого дня', () => {
    const p = where(PROGRAM, at('2026-10-29', '12:00', 5))
    expect(p).toMatchObject({ kind: 'before', days: 3 })
    expect((p as Extract<Phase, { kind: 'before' }>).first).toBe(DAY_FLIGHT)
  })

  test('вечером накануне до поездки остаётся 1 день', () => {
    expect(where(PROGRAM, at('2026-10-31', '23:30', 5))).toMatchObject({ kind: 'before', days: 1 })
  })

  test('утром в первый день: текущий пункт и следующий', () => {
    const p = day(where(PROGRAM, at('2026-11-01', '07:00', 5)))
    expect(p.day).toBe(DAY_FLIGHT)
    expect(p.cur).toBe(0)
    expect(p.nxt).toBe(1)
    expect(p.min).toBe(420)
    expect(p.tomorrow).toBe(DAY_MEDINA)
  })

  test('до первого пункта дня текущего нет, следующий — первый', () => {
    const p = day(where(PROGRAM, at('2026-11-01', '05:00', 5)))
    expect(p.cur).toBe(-1)
    expect(p.nxt).toBe(0)
  })

  test('в промежутке между пунктами текущим остаётся предыдущий', () => {
    const p = day(where(PROGRAM, at('2026-11-01', '09:00', 5)))
    expect(p.cur).toBe(1)
    expect(p.nxt).toBe(2)
  })

  test('на последнем пункте следующего нет (nxt = -1)', () => {
    const p = day(where(PROGRAM, at('2026-11-01', '23:00', 5)))
    expect(p.cur).toBe(2)
    expect(p.nxt).toBe(-1)
  })

  test('день окончен: последний пункт давно прошёл → cur = -2', () => {
    const p = day(where(PROGRAM, at('2026-11-03', '20:30', 3)))
    expect(p.cur).toBe(-2)
    expect(p.nxt).toBe(-1)
    expect(p.tomorrow).toBeUndefined()
  })

  test('последний пункт ещё идёт — день не окончен', () => {
    const p = day(where(PROGRAM, at('2026-11-03', '19:00', 3)))
    expect(p.cur).toBe(2)
  })

  test('у дня с другим часовым поясом «сегодня» считается по его поясу', () => {
    const p = day(where(PROGRAM, at('2026-11-02', '09:00', 3)))
    expect(p.day).toBe(DAY_MEDINA)
    expect(p.cur).toBe(1)
  })

  test('после полуночи в том же поясе остаётся «хвост» вчерашнего дня', () => {
    const p = day(where(PROGRAM, at('2026-11-03', '00:30', 3)))
    expect(p.day).toBe(DAY_MEDINA)
    expect(p.cur).toBe(5)            // «00:20 В отеле»
    expect(p.min).toBe(30 + 1440)
    expect(p.tomorrow).toBe(DAY_MECCA)
  })

  test('когда хвоста вчерашнего дня уже нет, показывается новый день', () => {
    const p = day(where(PROGRAM, at('2026-11-03', '03:00', 3)))
    expect(p.day).toBe(DAY_MECCA)
    expect(p.cur).toBe(-1)
    expect(p.nxt).toBe(0)
  })

  test('после последнего дня — фаза after', () => {
    const p = where(PROGRAM, at('2026-11-04', '10:00', 3))
    expect(p.kind).toBe('after')
    expect((p as Extract<Phase, { kind: 'after' }>).last).toBe(DAY_MECCA)
  })

  /* Найдено при написании тестов: при смене пояса на запад (Алматы UTC+5 → Медина UTC+3) в окне между
     полуночью по Алматы и полуночью по Медине (00:00–03:00 по UTC+5) ни «хвост», ни новый день не находятся,
     и where() возвращает kind: 'after' посреди поездки. Тест зафиксирован как ожидаемое падение. */
  test('в окне смены пояса между днями поездка не считается оконченной: это хвост прошлого дня', () => {
    const p = where(PROGRAM, at('2026-11-02', '00:30', 5))
    expect(p.kind).toBe('day')
    if (p.kind !== 'day') return
    expect(p.day.date).toBe('2026-11-01')
    expect(p.tomorrow?.date).toBe('2026-11-02')
  })
})

describe('where: ночь последнего дня', () => {
  test('после полуночи последнего дня поездка не окончена: текущий пункт — выезд в аэропорт', () => {
    const p = day(where(PROGRAM_DEPART, at('2026-11-05', '00:30', 3)))
    expect(p.day).toBe(DAY_DEPART)
    expect(p.cur).toBe(1)              // «23:30 Выезд в аэропорт»
    expect(p.nxt).toBe(2)              // «02:40 Вылет»
    expect(p.min).toBe(30 + 1440)
    expect(p.tomorrow).toBeUndefined()
  })

  test('в 03:00 следующих суток текущий пункт — вылет', () => {
    const p = day(where(PROGRAM_DEPART, at('2026-11-05', '03:00', 3)))
    expect(p.cur).toBe(2)
    expect(p.nxt).toBe(-1)
  })

  test('когда вылет и его длительность прошли — фаза after', () => {
    const p = where(PROGRAM_DEPART, at('2026-11-05', '05:00', 3))
    expect(p.kind).toBe('after')
    expect((p as Extract<Phase, { kind: 'after' }>).last).toBe(DAY_DEPART)
  })

  test('ночь последнего дня считается по поясу последнего дня', () => {
    const east: ProgramDay = { ...DAY_DEPART, tz: 'UTC+5' }
    const prog: Program = { ...PROGRAM, days: [DAY_MECCA, east] }
    // 01:30 по UTC+3 — это 03:30 по UTC+5: по поясу последнего дня уже идёт вылет
    const p = day(where(prog, at('2026-11-05', '01:30', 3)))
    expect(p.day).toBe(east)
    expect(p.cur).toBe(2)
  })
})

describe('where: пункт с явным концом', () => {
  const GAP: ProgramDay = {
    ...DAY_MECCA, items: [{ t: '06:15 → 10:35', w: 'Переезд' }, { t: '13:00', w: 'Обед' }],
  }
  const prog: Program = { ...PROGRAM, days: [GAP] }

  test('после явного конца пункта текущего нет, следующий — ближайший пункт', () => {
    const p = day(where(prog, at('2026-11-03', '11:30', 3)))
    expect(p.cur).toBe(-1)
    expect(p.nxt).toBe(1)
  })

  test('внутри диапазона пункт текущий', () => {
    const p = day(where(prog, at('2026-11-03', '08:00', 3)))
    expect(p.cur).toBe(0)
    expect(p.nxt).toBe(1)
  })

  test('последний пункт с явным концом прошёл и следующего нет → cur = -2', () => {
    const last: ProgramDay = { ...DAY_MECCA, items: [{ t: '09:00', w: 'Завтрак' }, { t: '10:00 → 11:00', w: 'Урок' }] }
    const p = day(where({ ...PROGRAM, days: [last] }, at('2026-11-03', '12:00', 3)))
    expect(p.cur).toBe(-2)
    expect(p.nxt).toBe(-1)
  })
})

describe('where и slots: неожиданные данные не роняют экран', () => {
  const now = at('2026-11-03', '10:30', 3)

  test('пустой список дней — безопасная фаза after с пустым днём-заглушкой', () => {
    const p = where({ ...PROGRAM, days: [] }, now)
    expect(p.kind).toBe('after')
    const last = (p as Extract<Phase, { kind: 'after' }>).last
    expect(last.items).toEqual([])
    expect(typeof last.date).toBe('string')
    expect(typeof last.city).toBe('string')
  })

  test('нет поля days вовсе — тоже фаза after', () => {
    const broken = { ...PROGRAM, days: undefined } as unknown as Program
    expect(where(broken, now).kind).toBe('after')
  })

  test('день без items — пустой список, текущего и следующего нет', () => {
    const bare = { id: 'x', date: '2026-11-03', city: 'Мекка', tz: 'UTC+3' } as unknown as ProgramDay
    expect(slots(bare)).toEqual([])
    const p = day(where({ ...PROGRAM, days: [bare] }, now))
    expect(p.list).toEqual([])
    expect(p.cur).toBe(-1)
    expect(p.nxt).toBe(-1)
  })

  test('пункт без t или w не ломает разбор', () => {
    const odd: ProgramDay = {
      ...DAY_MECCA,
      items: [{ w: 'Без времени' } as ProgramItem, { t: '12:00' } as ProgramItem, { t: '18:00', w: 'Ужин' }],
    }
    expect(() => slots(odd)).not.toThrow()
    expect(slots(odd).map(x => x.s)).toEqual([0, 720, 1080])
    expect(where({ ...PROGRAM, days: [odd] }, now).kind).toBe('day')
  })
})

describe('leftText', () => {
  test.each([
    [80, '1 ч 20 мин'], [45, '45 мин'], [0, '0 мин'], [-5, '0 мин'], [120, '2 ч 0 мин'], [59.6, '1 ч 0 мин'],
  ])('%d минут → «%s»', (mins, expected) => {
    expect(leftText(mins, 'ч', 'мин')).toBe(expected)
  })
  test('подписи единиц берутся из аргументов', () => {
    expect(leftText(61, 'h', 'min')).toBe('1 h 1 min')
  })
})

describe('stepFor', () => {
  const item = (w: string, m?: string): ProgramItem => ({ t: '', w, m })

  test.each([
    ['Умра всей группой: таваф, 2 ракаата, Замзам, сай, стрижка', undefined, 'enter'],
    ['Выезд в Мекку', 'Микат Зуль-Хулейфа: ихрам, намерение', 'rakat'],
    ['Намерение и тальбия', undefined, 'rakat'],
    ['Таваф вокруг Каабы', undefined, 'tawaf'],
    ['Гусль и ихрам в отеле', undefined, 'ghusl'],
    ['Переодеться в ихрам', undefined, 'ihram'],
    ['Сай между Сафой и Марвой', undefined, 'sai'],
    ['Умра — совершаем', undefined, 'enter'],
  ])('«%s» (%s) → %s', (w, m, expected) => {
    expect(stepFor(item(w, m))).toBe(expected)
  })

  test.each([
    ['Завтрак'], ['Свободное время'], ['Урок про ихрам'], ['Примерка ихрама'], ['Урок по умре'], ['Сайт группы'],
  ])('обычный пункт «%s» → null', w => {
    expect(stepFor(item(w))).toBeNull()
  })

  test('регистр не важен, ищет и в поле m', () => {
    expect(stepFor(item('ТАВАФ'))).toBe('tawaf')
    expect(stepFor(item('Обед', 'после таваф'))).toBe('tawaf')
  })

  test('пункт без текста — null', () => {
    expect(stepFor({ t: '', w: '' })).toBeNull()
  })
})

describe('tzNow: пояс города, где паломник сейчас', () => {
  test('в день Мекки — UTC+3', () => {
    expect(tzNow(PROGRAM, at('2026-11-03', '12:00', 3))).toBe(3)
  })

  test('в день вылета из Алматы — UTC+5', () => {
    expect(tzNow(PROGRAM, at('2026-11-01', '09:00', 5))).toBe(5)
  })

  test('до поездки — пояс первого дня, после — последнего', () => {
    expect(tzNow(PROGRAM, at('2026-10-20', '12:00', 5))).toBe(5)
    expect(tzNow(PROGRAM, at('2026-12-01', '12:00', 3))).toBe(3)
  })
})
