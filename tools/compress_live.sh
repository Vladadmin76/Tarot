#!/usr/bin/env bash
# Сжимает исходные видео живых карт (NN-имя-video.mp4) в live/major-NN.mp4: без звука, 720×1080, H.264, быстрый старт.
# Запуск: bash tools/compress_live.sh <папка с исходниками>
set -euo pipefail
src="${1:?укажите папку с исходными видео}"
mkdir -p live
for f in "$src"/*-video.mp4; do
  n=$(basename "$f"); n=${n%%-*}
  ffmpeg -v error -y -i "$f" -an -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart -vf scale=720:1080 "live/major-$n.mp4"
  echo "live/major-$n.mp4"
done
