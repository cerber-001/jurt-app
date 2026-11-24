/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Номер WhatsApp для заявок «Хочу поехать» (только цифры; задаётся при сборке, в коде номера нет). Не задан — приём заявок «скоро откроется» */
  readonly VITE_LEAD_WA?: string
  /** Ключ Google Maps Platform для Фото-3D (Photorealistic 3D Tiles; задаётся при сборке, в коде ключа нет).
      Не задан — окно 3D показывает только нашу модель и честно пишет «ключ ещё не настроен» */
  readonly VITE_GOOGLE_MAPS_KEY?: string
}
