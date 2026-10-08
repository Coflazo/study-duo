#!/bin/sh
# The small stills in the README's "What it does": crops of the 2x footage (public/footage), 800x500 each.
set -e
cd "$(dirname "$0")/.."
FFMPEG="node_modules/ffmpeg-static/ffmpeg"
[ -x "$FFMPEG" ] || FFMPEG="ffmpeg"
OUT=../docs/media/features
mkdir -p "$OUT"
crop() { # name source w h x y
  "$FFMPEG" -y -loglevel error -i "public/footage/$2" -vf "crop=$3:$4:$5:$6,scale=800:500:flags=lanczos" -q:v 3 "$OUT/$1.jpg"
}
crop timer popup-running.png 720 450 0 0
crop clock clock-0.png 1200 750 1616 0
crop lock blocked-reason.png 1200 750 808 520
crop music music-files.png 1200 750 1544 150
crop insights insights.png 1280 800 520 140
crop timeline timeline.png 1760 1100 700 100
ls -l "$OUT"
