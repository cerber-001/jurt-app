/* Экран не гаснет, пока открыт режим «Рядом» (Wake Lock: Safari iOS 16.4+, Chrome).
   Система сама отпускает блокировку, когда вкладку свернули, поэтому при возврате просим её снова. */
interface Sentinel { release(): Promise<void> }
type WakeNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }

/** Просит не гасить экран. Возвращает функцию, которая снимает просьбу. */
export function keepAwake(): () => void {
  let lock: Sentinel | null = null
  let stopped = false
  const ask = () => {
    if (stopped || document.visibilityState !== 'visible') return
    const wake = (navigator as WakeNavigator).wakeLock
    if (!wake) return
    wake.request('screen').then(
      l => {
        if (stopped) { void l.release().catch(() => undefined); return }
        // прежняя блокировка (если система её не отпустила сама) не должна остаться висеть
        const old = lock
        lock = l
        if (old && old !== l) void old.release().catch(() => undefined)
      },
      () => { /* телефон отказал (режим энергосбережения) — работаем как обычно */ },
    )
  }
  ask()
  document.addEventListener('visibilitychange', ask)
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', ask)
    void lock?.release().catch(() => undefined)
  }
}
