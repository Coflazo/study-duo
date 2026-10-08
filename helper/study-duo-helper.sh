#!/bin/sh
# Study Duo desktop helper (macOS, Linux): tells the Study Duo extension what desktop music apps are playing.
# Chrome starts it through native messaging when you turn on Desktop apps in Study Duo's Connections, and it reads
# only the song title, artist, album and app name. It never writes files, opens network connections or reads
# anything else. Read it before you install it: https://github.com/Coflazo/study-duo/blob/main/helper/study-duo-helper.sh
#
# Each message is Chrome's native messaging format: a 4-byte little-endian length, then UTF-8 JSON:
#   {"kind":"now","title":"...","artist":"...","album":"...","app":"Music","playing":true}
# For tests: STUDY_DUO_HELPER_FAKE="title<TAB>artist<TAB>album<TAB>app" (or none) stands in for the system, and
# STUDY_DUO_HELPER_ONCE=1 sends one message and stops.
set -u

INTERVAL="${STUDY_DUO_HELPER_INTERVAL:-3}"
TAB="$(printf '\t')"

# JSON string body: backslash and quote escaped, control characters dropped.
json_text() { printf '%s' "$1" | tr -d '\000-\010\012-\037' | tr '\t' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

send() {
  n=$(printf '%s' "$1" | wc -c | tr -d ' ')
  [ "$n" -le 4096 ] || return 0 # Chrome accepts more, but a song never needs this much
  # shellcheck disable=SC2059 # the format is built from fixed octal escapes
  printf "$(printf '\\%03o\\%03o\\%03o\\%03o' $((n & 255)) $(((n >> 8) & 255)) $(((n >> 16) & 255)) $(((n >> 24) & 255)))" || exit 0
  printf '%s' "$1" || exit 0
}

message() { # title artist album app playing(true|false)
  send "{\"kind\":\"now\",\"title\":\"$(json_text "$1")\",\"artist\":\"$(json_text "$2")\",\"album\":\"$(json_text "$3")\",\"app\":\"$(json_text "$4")\",\"playing\":$5}"
}

# One line: title<TAB>artist<TAB>album<TAB>app, empty when nothing is playing.
now_playing() {
  if [ -n "${STUDY_DUO_HELPER_FAKE:-}" ]; then
    [ "$STUDY_DUO_HELPER_FAKE" = none ] || printf '%s\n' "$STUDY_DUO_HELPER_FAKE"
    return
  fi
  case "$(uname -s)" in
    Darwin)
      for app in Music Spotify; do
        # Ask only an app that is running: this never starts it, and never asks where an app that is not installed is.
        pgrep -xq "$app" || continue
        line=$(osascript -e "tell application \"$app\" to if player state is playing then return (name of current track) & tab & (artist of current track) & tab & (album of current track) & tab & \"$app\"" 2>/dev/null)
        if [ -n "$line" ]; then
          printf '%s\n' "$line"
          return
        fi
      done
      ;;
    Linux)
      # Browsers publish every tab's audio and video here too; Study Duo reads music sites itself, so they are skipped.
      ignore="chromium,chrome,google-chrome,firefox,brave,vivaldi,opera,msedge,microsoft-edge,epiphany,plasma-browser-integration"
      if command -v playerctl >/dev/null 2>&1 && [ "$(playerctl -i "$ignore" status 2>/dev/null)" = "Playing" ]; then
        playerctl -i "$ignore" metadata --format "{{title}}${TAB}{{artist}}${TAB}{{album}}${TAB}{{playerName}}" 2>/dev/null
      fi
      ;;
  esac
}

main() {
  # Chrome closes our stdin when Study Duo lets go of the helper; then we stop. A background job's stdin is /dev/null
  # unless redirected, so the reader gets our stdin through file descriptor 3.
  exec 3<&0
  cat <&3 >/dev/null &
  reader=$!
  last="(nothing sent yet)"
  while kill -0 "$reader" 2>/dev/null || [ -n "${STUDY_DUO_HELPER_ONCE:-}" ]; do
    line=$(now_playing | head -n 1)
    # Exactly four fields: a title holding a tab or a line break must not get to choose the app it is filed under.
    if [ -n "$line" ] && [ "$(printf '%s' "$line" | tr -cd '\t' | wc -c | tr -d ' ')" != 3 ]; then line=""; fi
    if [ "$line" != "$last" ]; then
      if [ -n "$line" ]; then
        title=$(printf '%s' "$line" | cut -f 1)
        artist=$(printf '%s' "$line" | cut -f 2)
        album=$(printf '%s' "$line" | cut -f 3)
        app=$(printf '%s' "$line" | cut -f 4)
        message "$title" "$artist" "$album" "$app" true
      else
        message "" "" "" "" false
      fi
      last="$line"
    fi
    [ -z "${STUDY_DUO_HELPER_ONCE:-}" ] || break
    sleep "$INTERVAL"
  done
  kill "$reader" 2>/dev/null || true
}

main "$@"
