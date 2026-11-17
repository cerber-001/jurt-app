import type { ComponentType } from 'preact'
import { LocationProvider, Route, Router, lazy } from 'preact-iso'
import { Pilgrim } from './routes/pilgrim'
import { UpdateBar } from './components/update'
import { t } from './lib/i18n'

/** Файл страницы не загрузился (нет сети и нет копии, или после обновления старого файла уже нет на сервере):
    спокойная строка и кнопка «Обновить». Сами страницу не перезагружаем — никаких циклов перезагрузки */
export function LoadFailed() {
  return (
    <main class="wrap" tabIndex={-1}>
      <section class="card" role="alert">
        <p>{t('upd.chunk')}</p>
        <div class="btns"><button class="btn" onClick={() => location.reload()}>{t('upd.go')}</button></div>
      </section>
    </main>
  )
}

/** lazy из preact-iso при ошибке загрузки файла «зависает» навсегда (ждёт отклонённое обещание) — вместо этого
    отдаём экран LoadFailed. Ошибку загрузки ловим только здесь, у самого import() */
export function lazyRoute<P>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  return lazy(() => load().catch((): ComponentType<P> => LoadFailed as ComponentType<P>))
}

/* 1.1: паломник (/ и /p) — в основном файле, он нужен сразу. Входы устаза, штаба, витрина поездок и /roles —
   отдельными файлами по требованию: паломник их не скачивает до первого перехода. Все файлы лежат в precache PWA. */
const Home = lazyRoute(() => import('./routes/home').then(m => m.Home))
const Ustaz = lazyRoute(() => import('./routes/ustaz').then(m => m.Ustaz))
const Admin = lazyRoute(() => import('./routes/admin').then(m => m.Admin))
const Trips = lazyRoute(() => import('./routes/trips').then(m => m.Trips))
const TripPage = lazyRoute(() => import('./routes/trips').then(m => m.TripPage))

function NotFound() {
  return <main class="wrap"><section class="card"><h1>Страницы нет</h1><p><a href="/">На главную</a></p></section></main>
}

export function App() {
  return (
    <LocationProvider>
      <UpdateBar />
      <Router>
        <Route path="/" component={Pilgrim} />
        <Route path="/roles" component={Home} />
        <Route path="/p" component={Pilgrim} />
        <Route path="/ustaz" component={Ustaz} />
        <Route path="/admin" component={Admin} />
        <Route path="/trips" component={Trips} />
        <Route path="/trip/:code" component={TripPage} />
        <Route default component={NotFound} />
      </Router>
    </LocationProvider>
  )
}
