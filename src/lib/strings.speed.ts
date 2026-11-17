/* Строки интерфейса 1.1: скорость, плашка «Есть новая версия», значок офлайн-копии (бриф 1.1, A). Формат как в i18n.ts: [ru, kk, en] */
export const S_SPEED: Record<string, [string, string, string]> = {
  'upd.new': ['Есть новая версия гида', 'Жолсеріктің жаңа нұсқасы бар', 'A new version of the guide is ready'],
  'upd.go': ['Обновить', 'Жаңарту', 'Update'],
  'upd.busy': ['Обновляю…', 'Жаңартып жатырмын…', 'Updating…'],
  'upd.later': ['Позже', 'Кейінірек', 'Later'],
  'upd.saved': ['Гид сохранён на телефоне ✓', 'Жолсерік телефонда сақталды ✓', 'The guide is saved on this phone ✓'],
  'upd.chunk': ['Эта страница не загрузилась. Проверьте интернет и обновите страницу.', 'Бұл бет жүктелмеді. Интернетті тексеріп, бетті жаңартыңыз.', 'This page did not load. Check the internet connection and refresh the page.'],
  'upd.offline': ['Гид работает и без интернета.', 'Жолсерік интернетсіз де жұмыс істейді.', 'The guide works without the internet too.'],
}
