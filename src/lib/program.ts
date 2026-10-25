/* Программа тура: тот же program.json, что публикует v2 (umra.jurt.kz/program/program.json).
   Пока источник один — правка там видна здесь сразу. В фазе 2 переедет в Supabase. */

export interface ProgramItem {
  t: string; w: string; p?: string; m?: string; tr?: string; who?: string; pay?: string; st?: string
}
export interface ProgramDay { id: string; date: string; city: string; items: ProgramItem[]; title?: string }
export interface Program {
  title: string; subtitle: string; group: string; updated: string; version: string
  legend: Record<string, string> | string[]
  incl: string[]; excl: string[]; pay_rule: string
  days: ProgramDay[]
  decisions: unknown
}

const URL = import.meta.env.VITE_PROGRAM_URL as string

/* Публичная версия v3 — без имён «авторитетов» (решение 25.10.2026: устаз обезличен) */
export function anonymize(p: Program): Program {
  const fix = (s: string) =>
    s.replace(/духовный наставник\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/g, 'духовный наставник группы')
     .replace(/\bДаурен(?:а|у|ом|е)?\b/g, 'наставник')
  const days = p.days.map(d => ({
    ...d,
    items: d.items.map(i => ({ ...i, who: i.who && /Даурен/.test(i.who) ? 'наставник' : i.who, m: i.m ? fix(i.m) : i.m })),
  }))
  return { ...p, group: fix(p.group), days }
}

export async function fetchProgram(): Promise<Program> {
  const r = await fetch(URL + '?t=' + Date.now())
  if (!r.ok) throw new Error('Программа недоступна: ' + r.status)
  return anonymize((await r.json()) as Program)
}
