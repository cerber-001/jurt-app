/* Строки интерфейса 1.1: таваф и сай, дуа для чтения, доводка (бриф 1.1, C · E · G). Формат как в i18n.ts: [ru, kk, en] */
export const S_RITE: Record<string, [string, string, string]> = {
  // C. Звук на каждый круг — подпись словами и состояние словами (не только цвет кнопки)
  'rite.snd.on': ['Тихий звук: включён', 'Ақырын дыбыс: қосулы', 'Soft sound: on'],
  'rite.snd.off': ['Тихий звук: выключен', 'Ақырын дыбыс: өшірулі', 'Soft sound: off'],
  // D. Свайп между шагами — подсказка для экранного чтеца
  'rite.swipe': ['Шаги можно листать пальцем влево и вправо', 'Қадамдарды саусақпен солға және оңға парақтауға болады', 'Swipe left or right to change steps'],

  // G1. Вкладка «Группа»
  'grp.ann': ['Объявление', 'Хабарландыру', 'Announcement'],
  'grp.dep': ['Вылет', 'Ұшу', 'Departure'],
  'grp.ret': ['Возврат', 'Оралу', 'Return'],
  'grp.medina': ['Медина', 'Мәдина', 'Madinah'],
  'grp.mecca': ['Мекка', 'Мекке', 'Makkah'],
  'grp.flights': ['Рейсы', 'Рейстер', 'Flights'],
  'grp.chat': ['Чат группы в WhatsApp', 'Топтың WhatsApp чаты', 'Group chat on WhatsApp'],
  'grp.upd': ['Обновлено {d}', 'Жаңартылды: {d}', 'Updated {d}'],
  'grp.loading': ['обновляю…', 'жаңартылуда…', 'updating…'],
  'grp.hi': ['Ассаляму алейкум, {n}', 'Ассаламу алейкум, {n}', 'Assalamu alaikum, {n}'],
  'grp.room.medina': ['Комната в Медине', 'Мәдинадағы бөлме', 'Room in Madinah'],
  'grp.room.mecca': ['Комната в Мекке', 'Меккедегі бөлме', 'Room in Makkah'],
  'grp.with': ['с {names}', 'бірге: {names}', 'with {names}'],
  'grp.points': ['Места сбора', 'Жиналу орындары', 'Meeting points'],
  'grp.map': ['карта', 'карта', 'map'],
  'grp.sched': ['Расписание группы', 'Топтың кестесі', 'Group schedule'],
  'grp.ver': ['версия {v} · обновлено {d}', '{v} нұсқа · жаңартылды: {d}', 'version {v} · updated {d}'],
  'grp.incl': ['Входит', 'Бағаға кіреді', 'Included'],
  'grp.excl': ['Не входит', 'Бағаға кірмейді', 'Not included'],
  'grp.polls': ['Голосования группы', 'Топтағы дауыс беру', 'Group polls'],
  'grp.until': ['до {d}', '{d} дейін', 'until {d}'],
  'grp.voted': ['проголосовали {n} из {m}', '{m} адамның {n} дауыс берді', '{n} of {m} voted'],
  'grp.quorum': ['кворум {q}', 'кворум {q}', 'quorum {q}'],
  'grp.after': ['Итоги покажем после закрытия', 'Қорытындысы дауыс беру жабылған соң көрсетіледі', 'Results will be shown after the poll closes'],
  'grp.novote': ['Голосовать можно по личной ссылке паломника', 'Дауысты қажының жеке сілтемесі арқылы беруге болады', 'You can vote via your personal pilgrim link'],
}
