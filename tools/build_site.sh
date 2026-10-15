#!/usr/bin/env bash
# Собирает папку dist для публикации на Cloudflare: страница прототипа, колода, заголовки.
# Запуск из корня репозитория: bash tools/build_site.sh
set -euo pipefail
rm -rf dist
mkdir -p dist/decks
cp prototype/index.html dist/index.html
cp -r decks/cosmic-mysticism dist/decks/cosmic-mysticism
cp site/_headers site/robots.txt dist/
echo "dist готов: $(find dist -type f | wc -l) файлов, $(du -sh dist | cut -f1)"
