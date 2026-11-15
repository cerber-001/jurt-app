import { describe, expect, test } from 'vitest'
import { anonymize, type Program } from './program'
import { PROGRAM } from '../../tests/fixtures/program'

// Имя из исходника anonymize() собрано из частей, чтобы не повторять его открытым текстом в публичном репозитории.
const NAME = ['Да', 'урен'].join('')

const withPeople = (): Program => ({
  ...PROGRAM,
  group: 'UMRA-TEST · духовный наставник Иван Петров',
  days: [{
    ...PROGRAM.days[0],
    items: [
      { t: '08:00', w: 'Лекция', who: `${NAME} (наставник)`, m: 'Ведёт духовный наставник Иван Петров' },
      { t: '09:00', w: 'Завтрак', who: 'гид' },
      { t: '10:00', w: 'Дорога' },
    ],
  }],
})

describe('anonymize', () => {
  test('«духовный наставник Имя Фамилия» заменяется на обезличенную формулу', () => {
    const out = anonymize(withPeople())
    expect(out.group).toBe('UMRA-TEST · духовный наставник группы')
    expect(out.days[0].items[0].m).toBe('Ведёт духовный наставник группы')
  })

  test('поле who с именем наставника заменяется на «наставник», чужое остаётся', () => {
    const items = anonymize(withPeople()).days[0].items
    expect(items[0].who).toBe('наставник')
    expect(items[1].who).toBe('гид')
    expect(items[2].who).toBeUndefined()
  })

  test('не меняет исходный объект и сохраняет остальные поля', () => {
    const src = withPeople()
    const snapshot = JSON.stringify(src)
    const out = anonymize(src)
    expect(JSON.stringify(src)).toBe(snapshot)
    expect(out).not.toBe(src)
    expect(out.days[0].items[1]).toEqual(src.days[0].items[1])
    expect(out.title).toBe(src.title)
    expect(out.days.map(d => d.id)).toEqual(src.days.map(d => d.id))
  })

  test('программа без имён возвращается с тем же содержимым', () => {
    expect(anonymize(PROGRAM)).toEqual(PROGRAM)
  })

  test('пункты с пустым m не ломаются', () => {
    expect(() => anonymize({ ...PROGRAM, days: [{ ...PROGRAM.days[0], items: [{ t: '1', w: 'x', m: '' }] }] })).not.toThrow()
  })

  /* Найдено при написании тестов: в program.ts правило вида `/\bИмя(?:а|у|ом|е)?\b/g` не срабатывает на
     русском тексте, потому что в JavaScript \b без флага u считает «словом» только ASCII — между пробелом и
     кириллической буквой границы слова нет. Имя в склонениях внутри m и group остаётся в публичной версии. */
  test('имя наставника в тексте m обезличивается в любом падеже', () => {
    const src = withPeople()
    src.days[0].items[0].m = `Беседа с ${NAME}ом после зухра`
    expect(anonymize(src).days[0].items[0].m).not.toContain(NAME)
  })
})
