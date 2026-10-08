#!/bin/sh
# The README loop: out/demo.mp4 -> out/demo.gif, 800 wide at 12 fps with a palette built from the film itself.
set -e
cd "$(dirname "$0")/.."
FFMPEG="node_modules/ffmpeg-static/ffmpeg"
[ -x "$FFMPEG" ] || FFMPEG="ffmpeg"
"$FFMPEG" -y -loglevel error -i out/demo.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=200" out/palette.png
"$FFMPEG" -y -loglevel error -i out/demo.mp4 -i out/palette.png \
  -lavfi "fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" out/demo.gif
ls -lh out/demo.gif
