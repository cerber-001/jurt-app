/* Вежливая живая область для чтеца (VoiceOver, TalkBack). Сама область смонтирована всегда, а текст в неё
   кладём чуть позже: текст, появившийся вместе с новой областью, чтецы часто пропускают. Кнопки — вне области. */
import { useEffect, useState } from 'preact/hooks'

/** Через сколько после смены текста положить его в живую область, мс */
export const LIVE_DELAY_MS = 100

/** Текст для живой области: новый — с небольшой задержкой, пустой — сразу */
export function useLater(text: string): string {
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (!text) { setShown(''); return }
    const id = setTimeout(() => setShown(text), LIVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [text])
  return shown
}
