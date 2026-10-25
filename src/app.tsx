import { LocationProvider, Route, Router } from 'preact-iso'
import { Admin } from './routes/admin'
import { Home } from './routes/home'
import { Pilgrim } from './routes/pilgrim'
import { Ustaz } from './routes/ustaz'
import { TripPage, Trips } from './routes/trips'

function NotFound() {
  return <main class="wrap"><section class="card"><h1>Страницы нет</h1><p><a href="/">На главную</a></p></section></main>
}

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={Home} />
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
