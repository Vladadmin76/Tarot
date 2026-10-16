#!/usr/bin/env bash
# Загружает видео живых карт из папки live/ в корзину Cloudflare R2 (по умолчанию tarot-live).
# Нужны переменные CLOUDFLARE_API_TOKEN (права: Workers R2 Storage — Edit) и CLOUDFLARE_ACCOUNT_ID. Токен не вставлять в чат.
# Запуск из корня репозитория: bash tools/upload_live.sh
set -euo pipefail
bucket="${LIVE_BUCKET:-tarot-live}"
: "${CLOUDFLARE_API_TOKEN:?нужен CLOUDFLARE_API_TOKEN}"; : "${CLOUDFLARE_ACCOUNT_ID:?нужен CLOUDFLARE_ACCOUNT_ID}"
for f in live/*.mp4; do
  npx --yes wrangler@4 r2 object put "$bucket/$(basename "$f")" --file "$f" --content-type video/mp4 --cache-control "public, max-age=31536000, immutable" --remote
done
