/* Маленькая вымышленная программа для тестов часов: три дня, три города, два часовых пояса. */
import type { Program, ProgramDay } from '../../src/lib/program'

export const DAY_FLIGHT: ProgramDay = {
  id: 'd1', date: '2026-11-01', city: 'Алматы', tz: 'UTC+5',
  items: [
    { t: '06:00', w: 'Сбор в аэропорту' },
    { t: '08:30', w: 'Вылет в Медину' },
    { t: '≈22:10–01:45', w: 'Ночной рейс' },
  ],
}

export const DAY_MEDINA: ProgramDay = {
  id: 'd2', date: '2026-11-02', city: 'Медина', tz: 'UTC+3',
  items: [
    { t: 'Фаджр', w: 'Намаз Фаджр в мечети' },
    { t: '08:00', w: 'Завтрак' },
    { t: 'После зухра', w: 'Зиярат' },
    { t: 'Вечер', w: 'Свободное время' },
    { t: '22:10', w: 'Ужин' },
    { t: '00:20', w: 'В отеле' },
  ],
}

export const DAY_MECCA: ProgramDay = {
  id: 'd3', date: '2026-11-03', city: 'Мекка', tz: 'UTC+3',
  items: [
    { t: '10:00', w: 'Выезд в Мекку', m: 'Микат Зуль-Хулейфа: ихрам, намерение' },
    { t: '12:00', w: 'Умра всей группой: таваф, 2 ракаата, Замзам, сай, стрижка' },
    { t: '18:00', w: 'Ужин' },
  ],
}

export const PROGRAM: Program = {
  title: 'Тестовая программа', subtitle: '', group: 'UMRA-TEST', updated: '2026-10-30', version: 'test',
  legend: {}, incl: [], excl: [], pay_rule: '',
  days: [DAY_FLIGHT, DAY_MEDINA, DAY_MECCA],
  decisions: null,
}

/** Последний день с ночным вылетом: выезд в 23:30, вылет в 02:40 уже следующих суток */
export const DAY_DEPART: ProgramDay = {
  id: 'd4', date: '2026-11-04', city: 'Джидда', tz: 'UTC+3',
  items: [
    { t: '10:00', w: 'Завтрак' },
    { t: '23:30', w: 'Выезд в аэропорт' },
    { t: '02:40', w: 'Вылет' },
  ],
}

/** Программа, которая заканчивается ночным вылетом */
export const PROGRAM_DEPART: Program = { ...PROGRAM, days: [DAY_MECCA, DAY_DEPART] }

/** Момент «стенных» часов города: дата YYYY-MM-DD, ЧЧ:ММ, пояс UTC+tz → Date */
export function at(iso: string, hhmm: string, tz: number): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.parse(iso + 'T00:00:00Z') + (h * 60 + m - tz * 60) * 60_000)
}
