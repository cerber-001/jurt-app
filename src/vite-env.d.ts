/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Номер WhatsApp для заявок «Хочу поехать» (только цифры; задаётся при сборке, в коде номера нет). Не задан — приём заявок «скоро откроется» */
  readonly VITE_LEAD_WA?: string
}
