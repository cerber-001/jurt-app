/* Типы ответов сервера. Контракт — app_src/admin/Code.gs в проекте v2 (Apps Script на таблице Main_v2).
   Паспорта, ИИН и оплаты сервер не отдаёт никогда; здесь их нет и не будет. */

export interface Group {
  code: string          // UMRA-0009
  name: string
  dep: string           // дд.мм.гггг
  ret: string
  medina: string        // отель
  mecca: string
  flights: string
  chat?: string         // ссылка на WhatsApp (только с личным кодом)
  sheet?: string
  show?: string
  on?: boolean
}

export interface Announcement { text: string; at: string }

export interface ProgramRow {
  date: string; day: string; time: string; city: string; place: string; what: string; transport: string; who: string
}

export interface ExtraDua { when: string; title: string; ar: string; tr: string; ru: string; src: string }

export interface MeetPoint { city: string; name: string; how: string; map: string }

export interface Mate { name: string; tel: string }

export interface Me {
  name: string; first: string
  medina: string; mecca: string            // номера комнат
  matesMedina: Mate[]; matesMecca: Mate[]
}

export interface Poll {
  id: string; q: string; opts: string[]
  ends: number; endsTxt: string
  open: boolean; status: 'идёт' | 'закрыт'
  quorum: number; total: number; voted: number
  after: boolean                            // итоги только после закрытия
  mine: number                              // -1 = не голосовал
  counts: number[] | null
}

/** Ответ doGet — то, что видит паломник (и устаз: тот же вид без личного кода) */
export interface AppData {
  ok: true
  updated: string
  group: Group
  announcement: Announcement | null
  program: ProgramRow[]
  extra: ExtraDua[]
  me: Me | null
  points: MeetPoint[]
  chat: string
  polls: Poll[]
}

export interface ApiError { ok: false; error: string }

/** Ответ ADMIN.state — штаб организатора */
export interface Person {
  id: string; name: string; role: string; status: string; off: boolean; tel: string
  medina: string; mecca: string; link: string; wa: string
}
export interface AdminPoll extends Omit<Poll, 'mine' | 'counts' | 'status'> {
  status: 'идёт' | 'закрыт' | 'скрыт'; created: string
  counts: number[]; voters: string[][]; waiting: { id: string; name: string; wa: string }[]
}
export interface AdminState {
  ok: true
  g: Group
  groups: Group[]
  people: Person[]
  ann: Announcement | null
  history: { at: string; text: string; on: boolean }[]
  polls: AdminPoll[]
  total: number
  sheetUrl: string; xlsx: string; hubUrl: string
  updated: string
}
