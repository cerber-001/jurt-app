import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/base.css'
import './styles/content.css'
import './styles/core.css'
import './styles/v1.css'
import './styles/wow.css'
import './styles/wow-flow.css'
import './styles/wow-rite.css'
import './styles/wow-speed.css'
import './styles/everyday-today.css'
import './styles/everyday-journey.css'
import { App } from './app'
import { initPwa } from './components/update'
import { askPersist } from './lib/persist'

// 1.1: новая версия ждёт нажатия «Обновить» на плашке (components/update.tsx), а не перезагружает страницу сама
initPwa(registerSW)
// офлайн-копию — хранить постоянно (иначе Safari может её стереть); без окон и без ожидания
void askPersist()
render(<App />, document.getElementById('app')!)
