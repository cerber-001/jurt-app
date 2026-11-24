/* Строки окна «Харам заранее (3D)», этап 1а. Формат как в i18n.ts: [ru, kk, en].
   Отдельный словарь: его импортирует только ленивый модуль просмотрщика, в первый файл JS он не попадает.
   Полноту (три языка, без повторов ключей) проверяет i18n.test.ts вместе с основным словарём.
   Казахский и английский — на сверку носителем, как во всём приложении. */
import { lang, type Lang } from './store'

export const S_HARAM3D: Record<string, [string, string, string]> = {
  'h3.title': ['Харам заранее (3D)', 'Харамды алдын ала көру (3D)', 'The Haram in advance (3D)'],
  'h3.close': ['Закрыть', 'Жабу', 'Close'],
  'h3.canvas': ['Трёхмерный вид Харама. Вращайте и приближайте пальцами', 'Харамның үш өлшемді көрінісі. Саусақпен бұрып, жақындатыңыз', '3D view of the Haram. Rotate and zoom with your fingers'],

  // слои
  'h3.layers': ['Что показать', 'Не көрсету керек', 'What to show'],
  'h3.google': ['Фото-3D', 'Фото-3D', 'Photo 3D'],
  'h3.ours': ['Наша модель', 'Біздің модель', 'Our model'],
  'h3.views': ['Виды', 'Көріністер', 'Views'],

  // виды
  'h3.v.city': ['Город', 'Қала', 'City'],
  'h3.v.haram': ['Харам целиком', 'Харам толығымен', 'The whole Haram'],
  'h3.v.route': ['Путь от отеля до ворот', 'Қонақүйден қақпаға дейінгі жол', 'From the hotel to the gate'],
  'h3.v.masaa': ['Масъа сверху', 'Масъа жоғарыдан', 'The Mas‘a from above'],
  'h3.v.kaaba': ['Кааба вблизи', 'Қағба жақыннан', 'The Kaaba up close'],
  'h3.v.tawaf': ['Таваф', 'Тауаф', 'Tawaf'],
  'h3.v.sai': ['Сай', 'Сағи', 'Sa‘i'],

  // строка статуса: какой слой показан и почему
  'h3.s.ok': ['Фото-3D Google — снимки настоящего города', 'Google фото-3D — нағыз қаланың суреттері', 'Google Photo 3D: imagery of the real city'],
  'h3.s.loading': ['Загружается фото-3D…', 'Фото-3D жүктелуде…', 'Loading Photo 3D…'],
  'h3.s.chosen': ['Наша модель JURT — работает и без интернета', 'JURT моделі — интернетсіз де жұмыс істейді', 'Our JURT model: works without the internet too'],
  'h3.s.nokey': ['Ключ Google ещё не настроен — показана наша модель', 'Google кілті әлі бапталмаған — біздің модель көрсетілді', 'The Google key is not set up yet, so our model is shown'],
  'h3.s.offline': ['Нет интернета — показана наша модель', 'Интернет жоқ — біздің модель көрсетілді', 'No internet, so our model is shown'],
  'h3.s.quota': ['Лимит фото-3D на сегодня исчерпан — показана наша модель', 'Бүгінгі фото-3D лимиті таусылды — біздің модель көрсетілді', 'Today’s Photo 3D limit is used up, so our model is shown'],
  'h3.s.failed': ['Фото-3D не загрузилось — показана наша модель', 'Фото-3D жүктелмеді — біздің модель көрсетілді', 'Photo 3D did not load, so our model is shown'],
  'h3.ours.loading': ['Загружается наша модель…', 'Біздің модель жүктелуде…', 'Loading our model…'],
  'h3.ours.err': ['Наша модель не загрузилась. В первый раз нужен интернет.', 'Біздің модель жүктелмеді. Алғашқы рет интернет керек.', 'Our model did not load. The first time, you need the internet.'],
  'h3.retry': ['Попробовать снова', 'Қайта көру', 'Try again'],
  'h3.nogl': ['Ваш браузер не показывает 3D. Попробуйте открыть гид в свежем Safari или Chrome.', 'Браузеріңіз 3D көрсетпейді. Гидті жаңа Safari немесе Chrome-да ашып көріңіз.', 'Your browser cannot show 3D. Try opening the guide in an up-to-date Safari or Chrome.'],
  'h3.lost': ['3D не удалось показать — скорее всего, телефону не хватило памяти. Закройте окно и откройте снова.', '3D көрсету мүмкін болмады — телефонның жады жетпеген болуы мүмкін. Терезені жауып, қайта ашыңыз.', '3D could not be shown, most likely because the phone ran out of memory. Close this window and open it again.'],

  // пояснения к видам нашей модели
  'h3.n.tawaf': ['Паломники идут против часовой стрелки, Кааба слева. Вместо лиц — мягкий свет (нур).', 'Қажылар сағат тіліне қарсы жүреді, Қағба сол жақта. Жүздің орнында — жұмсақ нұр.', 'Pilgrims walk anticlockwise, with the Kaaba on their left. Faces are shown as soft light (nur).'],
  'h3.n.sai': ['Сай между Сафа и Марвой, туда и обратно. Между зелёными огнями мужчины ускоряют шаг, женщины идут обычно.', 'Сафа мен Марва арасындағы сағи, бару-қайту. Жасыл шамдар арасында ерлер адымын жылдамдатады, әйелдер қалыпты жүреді.', 'Sa‘i between Safa and Marwa, there and back. Between the green lights men quicken their pace, women walk normally.'],

  // путь от отеля до ворот (Фото-3D)
  'h3.r.start': ['Отель (пример: Address Jabal Omar)', 'Қонақүй (мысалы: Address Jabal Omar)', 'Hotel (example: Address Jabal Omar)'],
  'h3.r.end': ['Ворота № 79 короля Фахда', 'Фахд патша қақпасы № 79', 'King Fahd Gate No. 79'],
  'h3.r.info': ['{m} м · ≈ {a}–{b} мин пешком', '{m} м · жаяу ≈ {a}–{b} мин', '{m} m · ≈ {a}–{b} min on foot'],
  'h3.r.note': ['Наш расчёт по пешеходной сети OSM; на деле зависит от толпы.', 'OSM жаяу жол желісі бойынша біздің есеп; іс жүзінде адам көптігіне байланысты.', 'Our estimate from the OSM footpath network; in practice it depends on the crowd.'],

  // время Мекки: свет нашей модели идёт по нему (солнце днём, прожекторы ночью)
  'h3.clock': ['Сейчас в Мекке {t} — {p}', 'Қазір Меккеде {t} — {p}', 'Now in Makkah: {t}, {p}'],
  'h3.ph.morning': ['утро', 'таң', 'morning'],
  'h3.ph.day': ['день', 'күндіз', 'daytime'],
  'h3.ph.evening': ['вечер', 'кеш', 'evening'],
  'h3.ph.night': ['ночь', 'түн', 'night'],

  // подписи прав
  'h3.c.route': ['Линия пути и метки — JURT по данным OpenStreetMap', 'Жол сызығы мен белгілер — JURT, OpenStreetMap деректері бойынша', 'Route line and labels: JURT, based on OpenStreetMap data'],
  'h3.c.ours': ['Модель JURT · здания © участники OpenStreetMap (ODbL)', 'JURT моделі · ғимараттар © OpenStreetMap қатысушылары (ODbL)', 'JURT model · buildings © OpenStreetMap contributors (ODbL)'],
  'h3.c.kaaba': ['Кааба — по модели alfinann (Sketchfab, CC BY 4.0)', 'Қағба — alfinann моделі бойынша (Sketchfab, CC BY 4.0)', 'Kaaba based on the model by alfinann (Sketchfab, CC BY 4.0)'],
}

const IDX: Record<Lang, 0 | 1 | 2> = { ru: 0, kk: 1, en: 2 }

/** Строка окна 3D на текущем языке (нет перевода — русский; нет ключа — сам ключ), как t() в i18n.ts */
export function h3t(key: string): string {
  const r = S_HARAM3D[key]
  if (!r) return key
  return r[IDX[lang.value]] || r[0]
}

/** С подстановками: h3tf('h3.r.info', { m: 673, a: 8, b: 9 }) */
export function h3tf(key: string, vars: Record<string, string | number>): string {
  return h3t(key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}
