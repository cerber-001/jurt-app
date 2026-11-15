/* «Путь умры»: 11 шагов одной линией. Сверху — одна кнопка «Продолжить»; нажал на шаг — он открылся
   в режиме «Рядом». Отметки «сделано» хранятся на телефоне (jurt.done). */
import { contentError } from '../lib/content'
import { done, toggleDone } from '../lib/store'
import { t } from '../lib/i18n'
import { ModePicker, useContent, useMode } from './guide'
import { nearby } from './nearby'
import { clearRounds } from './rounds'
import { Card, Html, Icon } from './ui'

export function Path() {
  const c = useContent()
  const mode = useMode()
  if (contentError.value) return <p class="err" role="alert">{contentError.value}</p>
  if (!c) return <Card><div class="sk" /></Card>

  const marks = done.value
  const total = c.steps.length
  const n = c.steps.filter(s => marks[s.id]).length
  const cur = c.steps.find(s => !marks[s.id]) ?? null
  const target = cur ?? c.steps[0]
  const bans = c.info.find(i => i.id === 'ihram-bans')
  const kind = c.modes.kinds.find(k => k.id === mode.value)?.title
  const over = cur ? (n ? t('path.cont') : t('path.start')) : t('path.again')
  const reset = () => { if (confirm(t('path.resetq'))) { done.value = {}; clearRounds() } }

  return (
    <>
      <h1 class="sr-only">{t('nav.path')}</h1>
      <section class="path-head">
        <div class="kicker">{t('path.done')} {n} {t('step.of')} {total}</div>
        <div class="pbar" role="progressbar" aria-label={t('path.progress')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-valuetext={`${n} ${t('step.of')} ${total}`}><i style={{ width: (n / total) * 100 + '%' }} /></div>
        <button class="cta solid" onClick={() => (nearby.value = target.id)}>
          <Icon id={target.icon} size={34} />
          <span><small>{over}</small><b>{target.num}. {target.title}</b></span>
          <i aria-hidden="true">›</i>
        </button>
      </section>

      <ol class="path">
        {c.steps.map(s => {
          const isDone = !!marks[s.id]
          const kick = s.kicker ? (mode.value === 'mecca' ? s.kicker.mecca || s.kicker.first : s.kicker.first || s.kicker.mecca) : ''
          return (
            <li key={s.id} class={'prow' + (isDone ? ' done' : '') + (s.id === cur?.id ? ' cur' : '')}>
              <button class="prow-open" onClick={() => (nearby.value = s.id)}>
                <span class="pnum" aria-hidden="true">{s.num}</span>
                <span class="pt"><b>{s.title}</b>{kick && <small>{kick}</small>}</span>
              </button>
              <button class="chk" aria-pressed={isDone} onClick={() => toggleDone(s.id)}
                aria-label={t('path.check') + ': ' + s.title}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
              </button>
            </li>
          )
        })}
      </ol>

      <details class="path-opt">
        <summary>{t('path.kind')}{kind ? ': ' + kind : ''}</summary>
        <ModePicker mode={mode.value} set={m => (mode.value = m)} />
      </details>
      {bans && <details class="path-opt"><summary>{bans.title}</summary><Html html={bans.html} /></details>}
      {n > 0 && <p><button class="btn ghost sm" onClick={reset}>{t('path.reset')}</button></p>}
    </>
  )
}
