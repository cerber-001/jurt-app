import { describe, expect, test } from 'vitest'
import { compare, tagsOf } from './helpers/compareContent'

const run = (a: unknown, b: unknown, lang: 'kk' | 'en' = 'kk') => compare(a, b, 'x', lang)

describe('tagsOf', () => {
  test('переводимые атрибуты обнуляются, остальные остаются', () => {
    expect(tagsOf('<div class="a" aria-label="Привет" data-hint-3="Круг" title="t">'))
      .toEqual(['<div class="a" aria-label="" data-hint-3="" title="">'])
  })
  test('текст без тегов — пустой список', () => { expect(tagsOf('просто текст')).toEqual([]) })
})

describe('compare: сверка перевода со структурой оригинала', () => {
  test('идентичная структура с переведёнными строками — без ошибок', () => {
    expect(run({ id: 'a', title: 'Заголовок', items: ['один', 'два'] }, { id: 'a', title: 'Тақырып', items: ['бір', 'екі'] }).errors).toEqual([])
  })
  test('разные типы — ошибка', () => {
    expect(run({ a: 'x' }, { a: 5 }).errors[0]).toMatch(/тип string → number/)
  })
  test('разные ключи — ошибка с перечнем', () => {
    expect(run({ a: 'x', b: 'y' }, { a: 'x', c: 'y' }).errors[0]).toMatch(/ключи различаются: b, c/)
  })
  test('разная длина массива — ошибка', () => {
    expect(run({ l: ['a', 'b'] }, { l: ['a'] }).errors[0]).toMatch(/длина 2 → 1/)
  })
  test.each(['id', 'icon', 'num', 'ar', 'lat', 'lng', 'radius', 'goal', 'fix', 'url', 'kind'])(
    'служебный ключ «%s» должен совпадать', k => {
      expect(run({ [k]: 'a' }, { [k]: 'b' }).errors[0]).toMatch(/должно совпадать/)
    })
  test('ключ n (подписи на трёх языках) должен совпадать целиком', () => {
    const n = { ru: 'Тасбих', kk: 'Тәсбих', en: 'Tasbih' }
    expect(run({ n }, { n }).errors).toEqual([])
    expect(run({ n }, { n: { ...n, en: 'Other' } }).errors).toHaveLength(1)
  })
  test('изменённая последовательность тегов — ошибка', () => {
    expect(run({ html: '<p>да</p><ul><li>раз</li></ul>' }, { html: '<p>иә</p><ol><li>бір</li></ol>' }).errors[0]).toMatch(/разметка изменена/)
  })
  test('значения переводимых атрибутов менять можно', () => {
    expect(run({ html: '<b aria-label="Круг" data-hint-1="Начало">x</b>' }, { html: '<b aria-label="Айналым" data-hint-1="Басы">x</b>' }).errors).toEqual([])
  })
  test('изменённый класс — ошибка разметки', () => {
    expect(run({ html: '<b class="a">x</b>' }, { html: '<b class="b">x</b>' }).errors).toHaveLength(1)
  })
  test('арабский текст в строке должен совпадать', () => {
    expect(run({ s: 'ставь اللَّهُمَّ' }, { s: 'қой اللَّهُمَّ' }).errors).toEqual([])
    expect(run({ s: 'ставь اللَّهُمَّ' }, { s: 'қой سُبْحَانَ' }).errors[0]).toMatch(/арабский/)
  })
  test('пары [id, текст]: id обязан совпадать, текст переводится', () => {
    const a = { i: [['pass', 'Паспорт'], ['visa', 'Виза']] }
    expect(run(a, { i: [['pass', 'Төлқұжат'], ['visa', 'Виза']] }).errors).toEqual([])
    expect(run(a, { i: [['pasport', 'Төлқұжат'], ['visa', 'Виза']] }).errors[0]).toMatch(/id пункта/)
  })
  test('английский: кириллица в тексте — ошибка, в тегах и ключе n — нет', () => {
    expect(run({ t: 'привет' }, { t: 'привет' }, 'en').errors[0]).toMatch(/кириллические/)
    expect(run({ t: 'привет' }, { t: 'hello' }, 'en').errors).toEqual([])
    expect(run({ n: { ru: 'Да' } }, { n: { ru: 'Да' } }, 'en').errors).toEqual([])
  })
  test('казахский: дословное совпадение длинной русской строки — предупреждение, а не ошибка', () => {
    const s = 'Эта длинная строка осталась без перевода'
    const r = run({ t: s }, { t: s })
    expect(r.errors).toEqual([])
    expect(r.warnings[0]).toMatch(/не переведено/)
  })
  test('транслитерация (ключ tr) может совпадать с оригиналом без предупреждения', () => {
    const s = 'Аллаху́мма инни́ ури́ду-ль-‘у́мрата'
    expect(run({ tr: s }, { tr: s }).warnings).toEqual([])
  })
})
