import { Card, Foot, Top } from '../components/ui'

export function Home() {
  return (
    <>
      <Top title="JURT · Платформа паломника" sub="демо-версия v3 · app.jurt.kz" role="выбор роли" />
      <main class="wrap">
        <Card>
          <h1>Кто вы?</h1>
          <p class="muted">Одна платформа, три входа. Данные общие с гидом v2 (umra.jurt.kz): меняются там — видны здесь сразу.</p>
        </Card>
        <div class="roles">
          <a class="role-card" href="/p"><b>Паломник</b><small>Гид умры с отметками, дуа и зикры, моя комната, расписание и голосования группы. Вход по личной ссылке.</small></a>
          <a class="role-card" href="/ustaz"><b>Устаз · наставник</b><small>Тот же гид и программа без личных данных участников. Для сверки текстов и ведения группы.</small></a>
          <a class="role-card" href="/admin"><b>Организатор · штаб</b><small>Список группы, объявления, голосования. Вход по ключу штаба.</small></a>
        </div>
        <Foot />
      </main>
    </>
  )
}
