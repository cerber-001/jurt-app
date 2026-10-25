/* Строки интерфейса v3 на трёх языках. Русский — основной; казахский и английский — «на сверку»
   носителем (как в v2). Тексты гида (шаги, дуа, зикр) берутся из контента, здесь — только интерфейс. */
import { lang, type Lang } from './store'

export const LANGS: [Lang, string][] = [['ru', 'Рус'], ['kk', 'Қаз'], ['en', 'Eng']]

// [ru, kk, en]
const S: Record<string, [string, string, string]> = {
  'role.pilgrim': ['паломник', 'қажы', 'pilgrim'],
  'app.guide': ['Гид паломника', 'Қажы жолсерігі', 'Pilgrim guide'],
  'app.entercode': ['введите код', 'кодты енгізіңіз', 'enter your code'],
  'tab.today': ['Сегодня', 'Бүгін', 'Today'],
  'tab.group': ['Группа', 'Топ', 'Group'],
  'tab.umra': ['Умра', 'Умра', 'Umrah'],
  'tab.dua': ['Дуа', 'Дұға', 'Dua'],
  'tab.zikr': ['Зикр', 'Зікір', 'Dhikr'],
  'tab.program': ['Программа', 'Жол', 'Program'],
  'tab.where': ['Где группа', 'Топ қайда', 'Where'],
  'c.refresh': ['Обновить', 'Жаңарту', 'Refresh'],
  'c.other': ['Другой код', 'Басқа код', 'Other code'],
  'c.open': ['Открыть', 'Ашу', 'Open'],
  'c.yourcode': ['Ваш код', 'Сіздің кодыңыз', 'Your code'],
  'c.codehint': ['Личный код из ссылки организатора (тот же, что в гиде v2) или код группы вида UMRA-0009.',
    'Ұйымдастырушы сілтемесіндегі жеке код (v2 гидіндегідей) немесе UMRA-0009 түріндегі топ коды.',
    'Your personal code from the organizer\'s link (same as in guide v2) or a group code like UMRA-0009.'],
  'c.codeph': ['например: UMRA-0009', 'мысалы: UMRA-0009', 'e.g. UMRA-0009'],
  'c.common': ['Это общий вид группы. Комната, соседи и голосование открываются по личной ссылке от организатора.',
    'Бұл топтың жалпы көрінісі. Бөлме, көршілер және дауыс беру ұйымдастырушының жеке сілтемесі арқылы ашылады.',
    'This is the shared group view. Room, roommates and voting open via your personal link from the organizer.'],
  'c.home': ['На главную', 'Басты бетке', 'Home'],
  'c.loading': ['Загрузка…', 'Жүктелуде…', 'Loading…'],
  'c.lang': ['Язык', 'Тіл', 'Language'],
  'c.check': ['Перевод интерфейса — на сверке.', 'Интерфейс аудармасы тексерілуде.', 'Interface translation is pending review.'],
  'note.title': ['Заметка устаза группы', 'Топ ұстазының жазбасы', 'Note from the group\'s ustaz'],
  'note.src': ['Источник', 'Дереккөз', 'Source'],
  'note.add': ['+ Заметка устаза', '+ Ұстаз жазбасы', '+ Ustaz note'],
  'note.edit': ['Изменить', 'Өзгерту', 'Edit'],
  'note.del': ['Удалить', 'Жою', 'Delete'],
  'note.delq': ['Удалить заметку?', 'Жазбаны жою керек пе?', 'Delete this note?'],
  'note.save': ['Сохранить', 'Сақтау', 'Save'],
  'note.cancel': ['Отмена', 'Болдырмау', 'Cancel'],
  'note.ph': ['Пояснение к этому блоку для паломников группы (без имён; спорное — к знатоку фикха)',
    'Топ қажыларына арналған осы блокқа түсініктеме (есімсіз; даулы мәселе — фиқһ маманына)',
    'A note on this block for the group\'s pilgrims (no names; disputed matters go to a fiqh scholar)'],
  'note.srcph': ['Источник (книга, фетва ДУМК) — по желанию', 'Дереккөз (кітап, ҚМДБ пәтуасы) — қалауыңызша', 'Source (book, DUMK fatwa) — optional'],
  'note.onlytrip': ['Только для группы', 'Тек топ үшін', 'Only for group'],
  'today.next': ['Следующий намаз', 'Келесі намаз', 'Next prayer'],
  'today.in': ['через', 'кейін', 'in'],
  'today.h': ['ч', 'сағ', 'h'],
  'today.m': ['мин', 'мин', 'min'],
  'today.prayers': ['Время намазов', 'Намаз уақыттары', 'Prayer times'],
  'today.method': ['Расчёт', 'Есептеу', 'Method'],
  'today.city': ['Город', 'Қала', 'City'],
  'today.auto': ['по программе', 'бағдарлама бойынша', 'by program'],
  'today.weather': ['Погода', 'Ауа райы', 'Weather'],
  'today.qibla': ['Кибла', 'Құбыла', 'Qibla'],
  'today.compass': ['Включить компас', 'Компасты қосу', 'Enable compass'],
  'today.compassno': ['Компас недоступен на этом устройстве', 'Бұл құрылғыда компас қолжетімсіз', 'Compass unavailable on this device'],
  'today.compasshint': ['Положите телефон горизонтально. Стрелка показывает направление на Каабу.',
    'Телефонды көлбеу ұстаңыз. Көрсеткі Қағбаға бағытты көрсетеді.', 'Hold the phone flat. The arrow points towards the Kaaba.'],
  'today.plan': ['План дня', 'Күн жоспары', 'Day plan'],
  'today.noplan': ['Программа пока не загрузилась', 'Бағдарлама әзірге жүктелмеді', 'Program has not loaded yet'],
  'today.nextday': ['Ближайший день программы', 'Бағдарламаның жақын күні', 'Next program day'],
  'today.rain': ['осадки', 'жауын', 'precip.'],
  'today.wind': ['ветер', 'жел', 'wind'],
  'today.uv': ['УФ', 'УК', 'UV'],
  'today.sunrise': ['восход', 'күн шығуы', 'sunrise'],
  'today.sunset': ['закат', 'күн батуы', 'sunset'],
  'today.jumua': ['Сегодня джума', 'Бүгін жұма', 'Jumu\'ah today'],
  'today.todaytz': ['местное время города', 'қаланың жергілікті уақыты', 'local time of the city'],
  'p.fajr': ['Фаджр', 'Таң', 'Fajr'], 'p.sunrise': ['Восход', 'Күн шығуы', 'Sunrise'], 'p.dhuhr': ['Зухр', 'Бесін', 'Dhuhr'],
  'p.asr': ['Аср', 'Екінті', 'Asr'], 'p.maghrib': ['Магриб', 'Ақшам', 'Maghrib'], 'p.isha': ['Иша', 'Құптан', 'Isha'],
  'where.title': ['Где группа', 'Топ қайда', 'Where is the group'],
  'where.hint': ['Положение видно только тем, у кого есть код группы, и не сохраняется на сервере. Делиться можно выключить в любой момент.',
    'Орныңызды тек топ коды бар адамдар көреді, серверде сақталмайды. Бөлісуді кез келген уақытта өшіруге болады.',
    'Your location is visible only to people with the group code and is never stored on the server. You can stop sharing any time.'],
  'where.share': ['Делиться местом', 'Орынмен бөлісу', 'Share location'],
  'where.off': ['Не делиться', 'Бөліспеу', 'Stop sharing'],
  'where.me': ['Я', 'Мен', 'Me'],
  'where.meet': ['Место сбора', 'Жиналу орны', 'Meeting point'],
  'where.setmeet': ['Назначить место сбора здесь', 'Жиналу орнын осында белгілеу', 'Set meeting point here'],
  'where.clearmeet': ['Снять место сбора', 'Жиналу орнын алып тастау', 'Clear meeting point'],
  'where.notes': ['Заметки группы', 'Топ жазбалары', 'Group notes'],
  'where.noteph': ['Короткая заметка для группы', 'Топқа қысқа жазба', 'Short note for the group'],
  'where.send': ['Отправить', 'Жіберу', 'Send'],
  'where.lost': ['Я потерялся', 'Адасып қалдым', 'I am lost'],
  'where.found': ['Нашёлся', 'Табылдым', 'Found'],
  'where.online': ['В сети', 'Желіде', 'Online'],
  'where.nobody': ['Пока никого не видно. Положение появляется, когда участник открыл эту вкладку и включил «делиться».',
    'Әзірге ешкім көрінбейді. Қатысушы осы бетті ашып, «бөлісуді» қосқанда орны көрінеді.',
    'Nobody visible yet. People appear when they open this tab and turn sharing on.'],
  'where.name': ['Как вас показывать', 'Атыңыз қалай көрінсін', 'Your display name'],
  'where.ended': ['Поездка завершена — обмен местом выключен.', 'Сапар аяқталды — орынмен бөлісу өшірілген.', 'Trip ended — sharing is off.'],
  'where.gps': ['GPS недоступен: разрешите доступ к геопозиции в настройках браузера.', 'GPS қолжетімсіз: браузер параметрлерінде геолокацияға рұқсат беріңіз.', 'GPS unavailable: allow location access in the browser settings.'],
  'where.nocode': ['Нужен код группы — откройте вкладку «Группа».', 'Топ коды керек — «Топ» бетін ашыңыз.', 'Group code needed — open the Group tab.'],
  'where.open': ['Открыть в картах', 'Картада ашу', 'Open in maps'],
  'where.ago': ['мин назад', 'мин бұрын', 'min ago'],
  'where.now': ['сейчас', 'қазір', 'now'],
  'where.lead': ['ведущий', 'жетекші', 'leader'],
  'where.center': ['Ко мне', 'Маған', 'Me'],
  'where.all': ['Все', 'Барлығы', 'All'],
  'trips.title': ['Поездки', 'Сапарлар', 'Trips'],
  'trips.sub': ['витрина JURT', 'JURT сапарлары', 'JURT trips'],
  'trips.none': ['Пока нет открытых поездок', 'Әзірге ашық сапарлар жоқ', 'No public trips yet'],
  'trips.open': ['Открыть в гиде', 'Гидте ашу', 'Open in the guide'],
  'trips.all': ['Все поездки', 'Барлық сапарлар', 'All trips'],
  'trips.dates': ['Даты', 'Күндері', 'Dates'],
  'trips.route': ['Маршрут', 'Бағыт', 'Route'],
  'trips.notfound': ['Поездка не найдена', 'Сапар табылмады', 'Trip not found'],
  'trips.err': ['Витрина недоступна', 'Сапарлар тізімі қолжетімсіз', 'Trips are unavailable'],
  'st.план': ['план', 'жоспар', 'planned'], 'st.набор': ['набор группы', 'топ жинақталуда', 'enrolling'],
  'st.идёт': ['идёт сейчас', 'жүріп жатыр', 'ongoing'], 'st.завершена': ['завершена', 'аяқталды', 'completed'],
}

const IDX: Record<Lang, 0 | 1 | 2> = { ru: 0, kk: 1, en: 2 }

/** Строка интерфейса на текущем языке (нет перевода — русский; нет ключа — сам ключ) */
export function t(key: string): string {
  const r = S[key]
  if (!r) return key
  return r[IDX[lang.value]] || r[0]
}

/** Выбор перевода из объекта вида { ru, kk, en } (имена зикров, подписи погоды) */
export function pick(o: Record<string, string | undefined> | undefined, fallback = ''): string {
  if (!o) return fallback
  return o[lang.value] || o.ru || fallback
}

/** Дата ДД.ММ (ru/kk) или DD Mon (en) */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  if (lang.value === 'en') return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}`
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}
