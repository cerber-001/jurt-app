/* Строки интерфейса 2.0, этап 1 «Каждый день»: «Мой путь» и «Урок дня» (бриф 2.0 §7 B, C). Формат как в i18n.ts: [ru, kk, en] */
export const S_JOURNEY: Record<string, [string, string, string]> = {
  // нижнее меню режима «каждый день» и пункты «Ещё»
  'nav.today': ['Сегодня', 'Бүгін', 'Today'],
  'nav.journey': ['Мой путь', 'Менің жолым', 'My journey'],
  'jr.more.today': ['Сегодня — намаз, зикр, урок дня', 'Бүгін — намаз, зікір, күннің сабағы', 'Today: prayer, dhikr, lesson of the day'],
  'jr.more.steps': ['Шаги умры', 'Умра қадамдары', 'Umrah steps'],

  // дата поездки
  'jr.date': ['Дата поездки', 'Сапар күні', 'Trip date'],
  'jr.date.hint': ['День вылета — посчитаем, сколько осталось, и сроки подготовки', 'Ұшу күні — қанша қалғанын және дайындық мерзімдерін есептейміз', 'Departure day: we will count the days left and the preparation deadlines'],
  'jr.date.prog': ['по программе группы', 'топ бағдарламасы бойынша', 'from the group program'],
  'jr.date.clear': ['Очистить дату', 'Күнді өшіру', 'Clear the date'],

  // отсчёт
  'jr.cd.before': ['до поездки', 'сапарға дейін', 'until the trip'],
  'jr.cd.fly': ['Вылет {d} · умра', 'Ұшу {d} · умра', 'Departure {d} · umrah'],
  'jr.cd.today.k': ['день вылета', 'ұшу күні', 'departure day'],
  'jr.cd.today': ['Сегодня в путь', 'Бүгін жолға шығасыз', 'Today you set off'],
  'jr.cd.during.k': ['поездка идёт', 'сапар жүріп жатыр', 'trip in progress'],
  'jr.cd.during': ['Вы в пути', 'Сіз жолдасыз', 'You are on your way'],
  'jr.cd.during.go': ['Открыть «Сейчас»', '«Қазір» бөлімін ашу', 'Open “Now”'],
  'jr.cd.after.k': ['поездка позади', 'сапар артта қалды', 'the trip is behind you'],
  'jr.cd.after': ['С возвращением', 'Қош келдіңіз', 'Welcome back'],
  'jr.cd.after.t': ['Если готовитесь к новой поездке — укажите новую дату выше.', 'Жаңа сапарға дайындалсаңыз — жоғарыда жаңа күнді көрсетіңіз.', 'If you are preparing for a new trip, enter the new date above.'],
  'jr.cd.none': ['Укажите дату поездки — здесь появится отсчёт дней и сроки подготовки.', 'Сапар күнін көрсетіңіз — мұнда күндер санағы мен дайындық мерзімдері шығады.', 'Enter your trip date to see the countdown and the preparation deadlines.'],
  'jr.d.one': ['день', 'күн', 'day'],
  'jr.d.few': ['дня', 'күн', 'days'],
  'jr.d.many': ['дней', 'күн', 'days'],

  // подготовка по дням
  'jr.prep': ['Подготовка по дням', 'Күн сайынғы дайындық', 'Preparation day by day'],
  'jr.prep.got': ['Готово {k} из {n}', 'Дайын: {k} / {n}', 'Done {k} of {n}'],
  'jr.due': ['до {d}', '{d} дейін', 'by {d}'],
  'jr.p.lessons': ['Уроки 1–30', '1–30 сабақтар', 'Lessons 1–30'],
  'jr.p.lessons.s': ['сейчас урок {n} · по 3 мин в день', 'қазір {n}-сабақ · күніне 3 мин', 'now lesson {n} · 3 min a day'],
  'jr.p.docs': ['Документы и виза', 'Құжаттар мен виза', 'Documents and visa'],
  'jr.p.docs.s': ['паспорт, фото, анкета', 'төлқұжат, фото, сауалнама', 'passport, photo, application form'],
  'jr.p.talbiya': ['Тальбия — выучить', 'Тәлбияны жаттау', 'Learn the talbiya'],
  'jr.p.talbiya.s': ['откройте и читайте понемногу', 'ашып, біртіндеп оқыңыз', 'open it and read a little at a time'],
  'jr.p.ihram': ['Ихрам — как надеть', 'Ихрамды қалай кию', 'Ihram: how to put it on'],
  'jr.p.ihram.s': ['шаг «Ихрам» из шагов умры', 'умра қадамдарындағы «Ихрам» қадамы', 'the “Ihram” step of the umrah steps'],
  'jr.p.pack': ['Сборы — список вещей', 'Жол жүгі — заттар тізімі', 'Packing: the list of things'],
  'jr.p.pack.s': ['отмечайте по одному', 'бір-бірлеп белгілеңіз', 'tick them off one by one'],
  'jr.p.amanat': ['Дуа близких — аманат', 'Жақындардың дұғасы — аманат', 'Duas of loved ones: an amanah'],
  'jr.p.amanat.s': ['запишите, о чём просили помолиться', 'кім не сұрағанын жазып алыңыз', 'write down what they asked you to pray for'],

  // Харам заранее
  'jr.3d': ['Харам заранее (3D)', 'Харамды алдын ала көру (3D)', 'The Haram in advance (3D)'],
  'jr.3d.t': ['Пройдите путь тавафа и саи до поездки — на месте всё будет знакомо.', 'Тауаф пен сағи жолын сапарға дейін өтіп көріңіз — орнында бәрі таныс болады.', 'Walk the path of tawaf and sa’i before the trip, and everything will feel familiar there.'],
  'jr.3d.soon': ['Готовится', 'Дайындалуда', 'Coming soon'],

  // «Хочу поехать»
  'jr.lead.h': ['Ещё не записаны в группу?', 'Әлі топқа жазылмадыңыз ба?', 'Not in a group yet?'],
  'jr.lead.t': ['Оставьте заявку — организатор свяжется с вами.', 'Өтінім қалдырыңыз — ұйымдастырушы сізбен хабарласады.', 'Leave a request and the organizer will contact you.'],
  'jr.lead.btn': ['Хочу поехать', 'Барғым келеді', 'I want to go'],
  'jr.lead.soon': ['Приём заявок скоро откроется. Пока можно готовиться здесь: уроки, тальбия, сборы.', 'Өтінім қабылдау жақында ашылады. Әзірге осында дайындала беріңіз: сабақтар, тәлбия, жол жүгі.', 'Requests will open soon. Meanwhile you can prepare here: lessons, talbiya, packing.'],
  'jr.lead.msg': ['Ассаляму алейкум! Хочу поехать на умру.', 'Ассаламу алейкум! Умраға барғым келеді.', 'Assalamu alaikum! I would like to go on umrah.'],
  'jr.lead.when': ['Желаемый месяц: {m}.', 'Қалаған ай: {m}.', 'Preferred month: {m}.'],

  // «Урок дня»
  'ls.n': ['Урок {n}', '{n}-сабақ', 'Lesson {n}'],
  'ls.kicker': ['Урок дня · {m} мин', 'Күннің сабағы · {m} мин', 'Lesson of the day · {m} min'],
  'ls.of': ['Урок {n} из {all}', '{n} / {all} сабақ', 'Lesson {n} of {all}'],
  'ls.read': ['Читать', 'Оқу', 'Read'],
  'ls.prep.card': ['Урок готовится: текст проверяет знаток', 'Сабақ дайындалуда: мәтінді білікті маман тексеріп жатыр', 'Lesson in preparation: a scholar is checking the text'],
  'ls.prep.text': ['Урок готовится. Текст проходит проверку знатоком — после неё здесь будет три минуты чтения и вопрос «Проверь себя».', 'Сабақ дайындалуда. Мәтінді білікті маман тексеріп жатыр — одан кейін мұнда үш минуттық оқу және «Өзіңді тексер» сұрағы болады.', 'This lesson is being prepared. A scholar is checking the text; after that there will be three minutes of reading and a “Check yourself” question here.'],
  'ls.check': ['Проверь себя', 'Өзіңді тексер', 'Check yourself'],
  'ls.answer': ['Верный ответ: {a}', 'Дұрыс жауап: {a}', 'Correct answer: {a}'],
  'ls.again': ['Ещё раз', 'Тағы бір рет', 'Once more'],
  'ls.sources': ['Источники', 'Дереккөздер', 'Sources'],
  'ls.all': ['Все уроки', 'Барлық сабақтар', 'All lessons'],
  'ls.preparing': ['готовится', 'дайындалуда', 'in preparation'],
  'ls.err': ['Уроки не загрузились. Проверьте интернет и откройте снова.', 'Сабақтар жүктелмеді. Интернетті тексеріп, қайта ашыңыз.', 'The lessons did not load. Check the internet connection and open again.'],
}
