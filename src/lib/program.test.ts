import { describe, expect, test } from 'vitest'
import { STEP_IDS, anonymize, stepFor, type Program } from './program'
import steps from '../../public/content/steps.json'
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

/* Связь пункта программы с шагом умры. Программа пишется по-русски; правила знают и казахские,
   и английские слова — на случай, если программа или её пункт придут на другом языке. */
describe('stepFor', () => {
  const item = (w: string, m?: string) => ({ t: '', w, m })

  test.each([
    // пункты из настоящей программы группы
    ['Гусль, ихрам в номере. Чемоданы, выселение', 'Намерение — на микате.', 'ghusl'],
    ['2 ракаата, намерение умры, тальбия', 'Здесь входим в состояние ихрама.', 'rakat'],
    ['Зухр в ихраме', undefined, 'ihram'],
    ['Сбор: порядок умры, точка сбора у ворот', undefined, 'enter'],
    ['Умра всей группой: таваф, 2 ракаата, Замзам, сай, стрижка', 'Общее фото у Марвы.', 'enter'],
    ['Умра — для тех, кто не делал ночью (или после завтрака)', undefined, 'enter'],
    ['Фаджр. Прощальный таваф', '2 ракаата тавафа — после 06:45.', 'tawaf'],
    ['Выезд в Мекку', 'Микат Зуль-Хулейфа: ихрам, намерение', 'ihram'],
    // шаги, которых прежняя версия не находила
    ['Намерение и тальбия', undefined, 'niyya'],
    ['Тальбия всей группой', undefined, 'talbiya'],
    ['Вход в мечеть аль-Харам', undefined, 'enter'],
    ['2 ракаата у Макама Ибрахима', undefined, 'maqam'],
    ['2 ракаата после тавафа', undefined, 'tawaf'],
    ['Пьём Замзам', undefined, 'zamzam'],
    ['Стрижка и выход из ихрама', undefined, 'halq'],
    ['Стрижка, бритьё головы', undefined, 'halq'],
    ['Сай между Сафой и Марвой', undefined, 'sai'],
  ])('ru: «%s» (%s) → %s', (w, m, expected) => {
    expect(stepFor(item(w, m))).toBe(expected)
  })

  test.each([
    ['Ихрамның 2 рәкағаты', 'rakat'],
    ['Ният', 'niyya'],
    ['Тәлбия', 'talbiya'],
    ['Мешітке кіру', 'enter'],
    ['Тауап', 'tawaf'],
    ['Мақам Ибраһим жанында 2 рәкағат', 'maqam'],
    ['Зәмзәм', 'zamzam'],
    ['Сағи: Сафа', 'sai'],
    ['Шаш алдыру', 'halq'],
    ['Умраға ғұсыл', 'ghusl'],
  ])('kk: «%s» → %s', (w, expected) => {
    expect(stepFor(item(w))).toBe(expected)
  })

  test.each([
    ["2 rak'ahs of ihram", 'rakat'],
    ['Intention and talbiyah', 'niyya'],
    ['Talbiyah', 'talbiya'],
    ['Entering the mosque', 'enter'],
    ['Tawaf', 'tawaf'],
    ["2 rak'ahs at Maqam Ibrahim", 'maqam'],
    ['Zamzam', 'zamzam'],
    ["Sa'i between Safa and Marwa", 'sai'],
    ['Shaving the head', 'halq'],
    ['Umrah with the whole group', 'enter'],
  ])('en: «%s» → %s', (w, expected) => {
    expect(stepFor(item(w))).toBe(expected)
  })

  test.each([
    ['Завтрак'], ['Свободное время'], ['Урок про ихрам'], ['Примерка ихрама'], ['Урок по умре'], ['Сайт группы'],
    ['Аср своим джамаатом, 2 ракаата'], ['Завтрак. Гусль, чистая одежда, благовония'],
    ['Стамбул → Медина. Ихрам пока не надеваем — сначала Медина'],
  ])('обычный пункт «%s» → null', w => {
    expect(stepFor(item(w))).toBeNull()
  })

  test('из примечания m берутся только обряды, а не случайные упоминания', () => {
    expect(stepFor(item('Обед', 'после таваф'))).toBe('tawaf')
    expect(stepFor(item('Регистрация на рейс', 'Замзам 5 л — в аэропорту'))).toBeNull()
    expect(stepFor(item('Зиярат по святым местам', 'награда как за умру'))).toBeNull()
    expect(stepFor(item('Урок по ихраму и умре', 'ихрам, намерение, тальбия, таваф, сай'))).toBeNull()
  })

  test('регистр не важен; пустой пункт — null', () => {
    expect(stepFor(item('ТАВАФ'))).toBe('tawaf')
    expect(stepFor({ t: '', w: '' })).toBeNull()
  })

  test('любой найденный id есть среди шагов контента на всех языках', () => {
    const ids = (steps as { id: string }[]).map(s => s.id)
    for (const id of STEP_IDS) expect(ids).toContain(id)
  })
})
