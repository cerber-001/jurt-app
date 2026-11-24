#!/usr/bin/env bash
# Публикация сборки в ветку gh-pages без GitHub Actions (токен gh без scope workflow).
# Никаких временных .git и удалений: отдельный индекс внутри .git, дерево из dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cp dist/index.html dist/404.html          # SPA-роутинг на GitHub Pages
# 24.11: файлы прошлой сборки остаются на сайте ещё на одну выкладку. Новая версия включается сама
# (skipWaiting), а открытая на телефоне старая страница ещё может догружать свои куски (урок, 3D) —
# пусть они найдутся, пока человек не нажал «Обновить». Берём только то, что перечислено в прошлом sw.js,
# поэтому старьё не копится дольше одной выкладки.
git fetch -q origin gh-pages
for f in $(git show origin/gh-pages:sw.js | grep -o 'assets/[^"]*' | sort -u); do
  if [ ! -e "dist/$f" ] && git cat-file -e "origin/gh-pages:$f" 2>/dev/null; then git show "origin/gh-pages:$f" > "dist/$f"; fi
done
# в worktree .git — файл, поэтому служебный индекс кладём в настоящую папку git
export GIT_INDEX_FILE="$(git rev-parse --absolute-git-dir)/pages-index"
rm -f "$GIT_INDEX_FILE"                    # только наш служебный индекс
git --work-tree=dist add -A
tree=$(git write-tree)
commit=$(git commit-tree "$tree" -m "deploy $(date '+%d.%m.%Y %H:%M') from $(git rev-parse --short HEAD)")
git push -f origin "$commit:refs/heads/gh-pages"
echo "gh-pages ← $commit"
