#!/usr/bin/env bash
# Публикация сборки в ветку gh-pages без GitHub Actions (токен gh без scope workflow).
# Никаких временных .git и удалений: отдельный индекс внутри .git, дерево из dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cp dist/index.html dist/404.html          # SPA-роутинг на GitHub Pages
export GIT_INDEX_FILE="$PWD/.git/pages-index"
rm -f "$GIT_INDEX_FILE"                    # только наш служебный индекс
git --work-tree=dist add -A
tree=$(git write-tree)
commit=$(git commit-tree "$tree" -m "deploy $(date '+%d.%m.%Y %H:%M') from $(git rev-parse --short HEAD)")
git push -f origin "$commit:refs/heads/gh-pages"
echo "gh-pages ← $commit"
