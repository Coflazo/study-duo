#!/bin/sh
# The README loop: out/loop.mp4 (sh scripts/render.sh loop) -> out/demo.gif, 800 wide at 12 fps, with a palette built
# from the clip itself. Fails if the GIF comes out at 10 MB or more, which GitHub will not show inline.
set -e
cd "$(dirname "$0")/.."
FFMPEG="node_modules/ffmpeg-static/ffmpeg"
[ -x "$FFMPEG" ] || FFMPEG="ffmpeg"
IN="${1:-out/loop.mp4}"
"$FFMPEG" -y -loglevel error -i "$IN" -vf "fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=200" out/palette.png
"$FFMPEG" -y -loglevel error -i "$IN" -i out/palette.png \
  -lavfi "fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" out/demo.gif
ls -lh out/demo.gif
SIZE=$(wc -c < out/demo.gif)
[ "$SIZE" -lt 10000000 ] || { echo "demo.gif is $SIZE bytes; keep it under 10 MB"; exit 1; }
