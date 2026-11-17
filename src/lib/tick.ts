/* Живые часы экрана: перерисовка ровно в момент смены минуты, а не «когда-нибудь в пределах 30 секунд».
   Отсчёт до намаза и «через N мин» меняются вместе с часами в карточке «Сейчас».
   Работает и с демо-временем (?at=): граница минуты считается от того времени, что показано на экране. */
import { useEffect, useState } from 'preact/hooks'

const MINUTE_MS = 60_000
/** Небольшой запас после границы минуты: таймер не должен сработать за миг ДО неё */
const SLACK_MS = 40

/** Сколько миллисекунд осталось до следующей минуты (1…60 000) */
export function msToNextMinute(now: Date): number {
  return MINUTE_MS - (((now.getTime() % MINUTE_MS) + MINUTE_MS) % MINUTE_MS)
}

/** То же время без секунд: все подписи экрана считаются от одной и той же минуты */
export function floorMinute(now: Date): Date {
  const ms = now.getTime()
  return new Date(ms - (((ms % MINUTE_MS) + MINUTE_MS) % MINUTE_MS))
}

/** Перерисовать компонент, когда сменится минута времени now; а также сразу при возврате на вкладку
    (телефон спал — таймеры стояли, а часы ушли вперёд) */
export function useMinuteTick(now: Date): void {
  const [, tick] = useState(0)
  const minute = floorMinute(now).getTime()
  useEffect(() => {
    const id = setTimeout(() => tick(x => x + 1), msToNextMinute(now) + SLACK_MS)
    return () => clearTimeout(id)
  }, [minute])
  useEffect(() => {
    const wake = () => { if (document.visibilityState !== 'hidden') tick(x => x + 1) }
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [])
}
