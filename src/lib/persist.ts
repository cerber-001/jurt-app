/* Просьба к браузеру хранить офлайн-копию гида постоянно, а не «пока хватает места».
   Без неё Safari может стереть данные сайта, который долго не открывали, и гид без сети не откроется.
   Окна не показывает нигде, кроме Firefox на компьютере, — там не просим. Отказ или ошибка — тихо дальше. */

let asked = false

/** Firefox на компьютере спрашивает разрешение всплывающим окном; Firefox на iPhone (FxiOS) — это WebKit, окна нет */
function promptsUser(ua: string): boolean {
  return /Firefox\//.test(ua) && !/FxiOS/.test(ua)
}

export async function askPersist(): Promise<void> {
  if (asked || typeof navigator === 'undefined') return
  asked = true
  const storage = navigator.storage
  if (!storage?.persist || promptsUser(navigator.userAgent)) return
  try {
    if (storage.persisted && (await storage.persisted())) return
    await storage.persist()
  } catch {
    /* браузер не дал — гид работает как раньше, офлайн-копия остаётся обычной */
  }
}

/** Для тестов: снова разрешить один запрос */
export function forgetPersistAsk(): void {
  asked = false
}
