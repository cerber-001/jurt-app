import { Card, Foot, Top } from '../components/ui'

export function Home() {
  return (
    <>
      <Top title="JURT · Платформа паломника" sub="app.jurt.kz" role="входы" />
      <main class="wrap">
        <Card>
          <h1>Входы</h1>
          <p class="muted">Одна платформа, три входа: паломник, устаз и организатор.</p>
        </Card>
        <div class="roles">
          <a class="role-card" href="/"><b>Паломник</b><small>Гид умры с отметками, дуа и зикры, моя комната, расписание и голосования группы. Вход по личной ссылке.</small></a>
          <a class="role-card" href="/ustaz"><b>Устаз · наставник</b><small>Тот же гид и программа без личных данных участников. Для сверки текстов и ведения группы.</small></a>
          <a class="role-card" href="/admin"><b>Организатор · штаб</b><small>Список группы, объявления, голосования. Вход по ключу штаба.</small></a>
        </div>
        <Foot />
      </main>
    </>
  )
}
