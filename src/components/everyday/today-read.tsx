/* «Сегодня»: азкары утра/вечера для чтения и мысль дня.
   Азкары — только уже опубликованные в приложении зикры из content/zikr.json (арабский, транскрипция, смысл,
   источник с номером хадиса); новых религиозных текстов здесь нет. Подбор задан заказчиком:
   утро — bihamdihi, tahlil, istighfar; вечер — azim, salawat, hawqala. «Читать дальше» — окно чтения reader.tsx.
   Мысль дня — content/thoughts.json (ru) и kk/thoughts.json; для en — русский с пометкой языка.
   У мысли поле road: дорожная (про сборы, рейс, спутников) или общая. Дата поездки не задана — только общие. */
import { useEffect, useState } from 'preact/hooks'
import { fetchLocalized, type DuaItem, type Zikr } from '../../lib/content'
import { t } from '../../lib/i18n'
import { lang, type Lang } from '../../lib/store'
import { pickThought } from '../../lib/today-day'
import { reading } from '../reader'

export const MORNING = ['bihamdihi', 'tahlil', 'istighfar'] as const
export const EVENING = ['azim', 'salawat', 'hawqala'] as const

interface Loaded<T> { data: T | null; lang: Lang | null; failed: boolean }

/** Файл контента на текущем языке (с запасным русским); перезагружается при смене языка */
export function useLocalized<T>(name: string): Loaded<T> {
  const l = lang.value
  const [st, setSt] = useState<Loaded<T> & { for?: Lang }>({ data: null, lang: null, failed: false })
  useEffect(() => {
    let live = true
    fetchLocalized<T>(name, l)
      .then(r => { if (live) setSt({ data: r.data, lang: r.lang, failed: false, for: l }) })
      .catch(() => { if (live) setSt(s => ({ ...s, failed: true, for: l })) })
    return () => { live = false }
  }, [name, l])
  return st
}

/** Зикр из контента → строка окна чтения (в kk/en файлах поле ru — смысл на языке файла) */
export function zikrItem(z: Zikr, l: Lang): DuaItem {
  const src = Array.isArray(z.src) ? (z.src as string[]).join('; ') : z.src
  return { label: z.n[l] || z.n.ru, ar: z.ar as string | undefined, tr: z.tr as string | undefined, ru: z.ru as string | undefined, src }
}

/** Клавиши вкладок (ARIA tabs): стрелки — соседняя (их две, по кругу), Home — первая, End — последняя */
function tabKey(key: string, cur: 'm' | 'e'): 'm' | 'e' | null {
  if (key === 'ArrowLeft' || key === 'ArrowRight') return cur === 'm' ? 'e' : 'm'
  if (key === 'Home') return 'm'
  if (key === 'End') return 'e'
  return null
}

export function AzkarCard({ morningNow }: { morningNow: boolean }) {
  const [choice, setChoice] = useState<'m' | 'e' | null>(null)
  const part = choice ?? (morningNow ? 'm' : 'e')
  const z = useLocalized<Zikr[]>('zikr.json')
  const ids: readonly string[] = part === 'm' ? MORNING : EVENING
  const fileLang = z.lang ?? lang.value
  const items = z.data ? ids.map(id => z.data!.find(x => x.id === id)).filter((x): x is Zikr => !!x).map(x => zikrItem(x, fileLang)) : []
  const title = t(part === 'm' ? 'today.azMorning' : 'today.azEvening')
  const first = items[0]
  const tab = (k: 'm' | 'e', label: string) => (
    <button role="tab" id={'td-az-' + k} aria-selected={part === k} aria-controls="td-az-panel" tabIndex={part === k ? 0 : -1}
      class={part === k ? 'on' : ''} onClick={() => setChoice(k)}
      onKeyDown={e => { const o = tabKey(e.key, k); if (o) { e.preventDefault(); setChoice(o); document.getElementById('td-az-' + o)?.focus() } }}>
      {label}
    </button>
  )
  return (
    <section class="card td-az" aria-labelledby="td-az-h">
      <h2 id="td-az-h" class="td-k">{title}</h2>
      <div class="td-seg" role="tablist" aria-label={t('today.azSwitch')}>
        {tab('m', t('today.azM'))}{tab('e', t('today.azE'))}
      </div>
      <div id="td-az-panel" role="tabpanel" aria-labelledby={'td-az-' + part} lang={fileLang}>
        {!first && <p class="muted">{z.failed ? t('err.content') : t('c.loading')}</p>}
        {first && <>
          <h3 class="td-zk-name">{first.label}</h3>
          {first.ar && <p class="td-ar" lang="ar" dir="rtl">{first.ar}</p>}
          {first.tr && <p class="td-tr">{first.tr}</p>}
          {first.ru && <p class="td-mean">{first.ru}</p>}
          {first.src && <p class="td-zsrc">{first.src}</p>}
          <button class="btn ghost td-more" onClick={() => { reading.value = { title, items } }}>{t('today.azMore')}</button>
        </>}
      </div>
    </section>
  )
}

interface Thought { id: string; road?: boolean; text: string }

/** road — дата поездки задана (вручную или программой группы) и поездка ещё впереди */
export function ThoughtCard({ iso, road }: { iso: string; road: boolean }) {
  const th = useLocalized<Thought[]>('thoughts.json')
  const one = pickThought(th.data ?? [], iso, road)
  if (!one) return (
    <section class="card sand td-thought" aria-busy={!th.failed}>
      <h2 class="td-k">{t('today.thought')}</h2>
      <small class="muted">{th.failed ? t('err.content') : t('c.loading')}</small>
    </section>
  )
  return (
    <section class="card sand td-thought" aria-labelledby="td-th-h">
      <h2 id="td-th-h" class="td-k">{t('today.thought')}</h2>
      <p lang={th.lang ?? undefined}>{one.text}</p>
    </section>
  )
}
