import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/base.css'
import './styles/content.css'
import './styles/core.css'
import './styles/v1.css'
import { App } from './app'

registerSW({ immediate: true })
render(<App />, document.getElementById('app')!)
