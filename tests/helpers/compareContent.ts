/* Сверка перевода контента со структурой русского оригинала. Порт check_content.py на TypeScript.
   Правила: те же ключи, типы и длины массивов; значения «служебных» ключей совпадают;
   в html — та же последовательность тегов (переводимые атрибуты можно менять); арабский текст неизменен;
   в английском нет кириллицы. */
export type Lang = 'kk' | 'en'
export const CONTENT_FILES = ['steps', 'dua', 'zikr', 'info', 'modes', 'pack', 'stories'] as const

/** Ключи, значения которых в переводе обязаны совпадать с русским оригиналом. */
export const SAME_KEYS = new Set(['id', 'icon', 'num', 'ar', 'lat', 'lng', 'radius', 'goal', 'fix', 'url', 'kind', 'n'])

const TRANSLATABLE_ATTR = /\b(aria-label|data-hint-\d|data-unit|data-plural|title|alt)="[^"]*"/g
export const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g
export const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

export interface Report { errors: string[]; warnings: string[] }
type Json = unknown

export const tagsOf = (s: string): string[] =>
  (s.match(/<[^>]+>/g) ?? []).map(x => x.replace(TRANSLATABLE_ATTR, (_m, a: string) => `${a}=""`))

const typeName = (v: Json) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const isStr = (v: Json): v is string => typeof v === 'string'
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b)

function compareString(a: string, b: string, path: string, key: string | null, lang: Lang, r: Report) {
  const ta = tagsOf(a), tb = tagsOf(b)
  if (!same(ta, tb)) {
    let k = ta.findIndex((x, n) => x !== tb[n])
    if (k < 0) k = Math.min(ta.length, tb.length)
    r.errors.push(`${path}: разметка изменена (тегов ${ta.length} → ${tb.length}), первое расхождение №${k}: `
      + `${(ta[k] ?? '—').slice(0, 90)}  ≠  ${(tb[k] ?? '—').slice(0, 90)}`)
  }
  if (!same(a.match(ARABIC) ?? [], b.match(ARABIC) ?? [])) r.errors.push(`${path}: арабский текст изменён`)
  const text = b.replace(/<[^>]+>/g, ' ')
  const cyr = CYRILLIC.exec(text)
  if (lang === 'en' && cyr) r.errors.push(`${path}: в английском остались кириллические буквы: «${cyr[0]}» ${JSON.stringify(text.slice(Math.max(0, cyr.index - 20), cyr.index + 30))}`)
  if (lang === 'kk' && key !== 'tr' && a === b && a.length > 25 && CYRILLIC.test(a)) r.warnings.push(`${path}: совпадает с русским — не переведено?`)
}

export function compare(a: Json, b: Json, path: string, lang: Lang, r: Report = { errors: [], warnings: [] }, key: string | null = null): Report {
  if (typeName(a) !== typeName(b)) { r.errors.push(`${path}: тип ${typeName(a)} → ${typeName(b)}`); return r }
  if (isStr(a)) { compareString(a, b as string, path, key, lang, r); return r }
  if (Array.isArray(a)) {
    const bb = b as Json[]
    if (a.length !== bb.length) { r.errors.push(`${path}: длина ${a.length} → ${bb.length}`); return r }
    const pair = key === 'i' || (a.length === 2 && a.every(isStr) && /\.i\[\d+\]$/.test(path))
    a.forEach((x, n) => {
      if (pair && n === 0 && isStr(x)) { if (x !== bb[n]) r.errors.push(`${path}[0]: id пункта должен совпадать`) }
      else compare(x, bb[n], `${path}[${n}]`, lang, r, key)
    })
    return r
  }
  if (a && typeof a === 'object') {
    const ao = a as Record<string, Json>, bo = b as Record<string, Json>
    const ka = Object.keys(ao), kb = Object.keys(bo)
    const diff = [...ka.filter(k => !kb.includes(k)), ...kb.filter(k => !ka.includes(k))].sort()
    if (diff.length) r.errors.push(`${path}: ключи различаются: ${diff.join(', ')}`)
    for (const k of ka) {
      if (!(k in bo)) continue
      if (SAME_KEYS.has(k)) { if (!same(ao[k], bo[k])) r.errors.push(`${path}.${k}: должно совпадать с оригиналом`) }
      else compare(ao[k], bo[k], `${path}.${k}`, lang, r, k)
    }
    return r
  }
  if (a !== b) r.errors.push(`${path}: значение изменено`)
  return r
}
