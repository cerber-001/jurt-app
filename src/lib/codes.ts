/* Код группы (UMRA-0010): буквы, дефис, 3–5 цифр. Та же проверка — для ввода на вкладке «Группа», для ?g= в адресе
   и для сохранённого на телефоне кода: код уходит в фильтры Supabase (.or() заметок устаза, фильтр Realtime
   «Где группа»), и всё, что не похоже на код, туда попадать не должно. */
export const GROUP_CODE_RE = /^[A-Za-z]+-\d{3,5}$/

/** Похоже ли значение на код группы (без пробелов по краям) */
export const isGroupCode = (v: string): boolean => GROUP_CODE_RE.test(v)

/** Код группы заглавными или '' — если значение на код не похоже */
export const groupCodeOrEmpty = (v: string | null | undefined): string => {
  const s = (v ?? '').trim()
  return isGroupCode(s) ? s.toUpperCase() : ''
}
