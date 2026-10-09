#!/bin/sh
# Study Duo installer for macOS and Linux.
# Read it before you run it: https://github.com/Coflazo/study-duo/blob/main/install.sh
#
# What it does, and nothing else:
#   1. downloads the latest release and its SHA256SUMS from github.com/Coflazo/study-duo over HTTPS,
#   2. stops unless the SHA-256 matches (and checks GitHub's build attestation when the GitHub CLI is signed in),
#   3. unzips it to "~/Study Duo/chromium" (a visible folder: no sudo, no admin rights),
#   4. copies that path to your clipboard and opens your browser's extensions page (each one you name with
#      --browsers chrome,edge,brave,arc,opera,vivaldi,firefox; Firefox opens the signed add-on instead),
#   5. prints the clicks left.
# Uninstall: sh install.sh --uninstall   (removes the folder and the helper; remove the card in your browser)
#
# Optional, with --helper (curl ... | sh -s -- --helper): also installs the desktop helper, a small script that tells
# Study Duo what desktop music apps are playing, and registers it with your Chromium browsers for Study Duo only.
# It is off until you turn on Desktop apps in Study Duo's Connections. Read it first: helper/study-duo-helper.sh

set -eu

REPO="Coflazo/study-duo"
DEFAULT_BASE="https://github.com/$REPO/releases/latest/download"
BASE="${STUDY_DUO_BASE_URL:-$DEFAULT_BASE}"
HOME_DIR="${STUDY_DUO_HOME:-$HOME/Study Duo}"
DEST="$HOME_DIR/chromium"
ZIP="study-duo-chromium.zip"
HELPER="study-duo-helper.sh"
HELPER_DIR="$HOME_DIR/helper"
HOST="com.coflazo.study_duo"
EXTENSION_ID="bcggiingdefmehpjcalkfpdnehpcieon"
XPI_URL="${STUDY_DUO_XPI_URL:-https://coflazo.github.io/study-duo/study-duo.xpi}"
BROWSERS="chrome edge brave arc opera vivaldi firefox"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'Study Duo: %s\n' "$*" >&2
  exit 1
}

# STUDY_DUO_BASE_URL is for tests and mirrors: HTTPS, or plain HTTP only to this computer.
check_base() {
  [ "$BASE" = "$DEFAULT_BASE" ] && return 0
  case "$BASE" in
    https://* | http://127.0.0.1:* | http://localhost:*) say "Note: STUDY_DUO_BASE_URL is set, so this downloads from $BASE instead of GitHub." ;;
    *) fail "STUDY_DUO_BASE_URL must start with https:// (or http://127.0.0.1 for a local test server)." ;;
  esac
}

download() {
  if command -v curl >/dev/null 2>&1; then
    case "$BASE" in
      https://*) curl -fsSL --proto '=https' --tlsv1.2 "$1" -o "$2" ;;
      *) curl -fsSL "$1" -o "$2" ;;
    esac
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    fail "needs curl or wget to download."
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d ' ' -f 1
  else fail "needs sha256sum or shasum to check the download."
  fi
}

copy_path() {
  [ -n "${STUDY_DUO_NO_OPEN:-}" ] && return 1
  if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$1" | pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then printf '%s' "$1" | wl-copy
  elif command -v xclip >/dev/null 2>&1; then printf '%s' "$1" | xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then printf '%s' "$1" | xsel --clipboard --input
  else return 1
  fi
}

# Opens the first installed Chromium browser on its extensions page; prints which one.
open_extensions() {
  [ -n "${STUDY_DUO_NO_OPEN:-}" ] && return 1
  if [ "$(uname -s)" = "Darwin" ]; then
    for pair in "Google Chrome|chrome" "Microsoft Edge|edge" "Brave Browser|brave" "Arc|chrome" "Vivaldi|vivaldi" "Opera|opera" "Chromium|chrome"; do
      app="${pair%%|*}"
      scheme="${pair##*|}"
      if [ -d "/Applications/$app.app" ] || [ -d "$HOME/Applications/$app.app" ]; then
        open -a "$app" "$scheme://extensions" 2>/dev/null && { say "Opened $app on its extensions page."; return 0; }
      fi
    done
  else
    for pair in "google-chrome|chrome" "google-chrome-stable|chrome" "chromium|chrome" "chromium-browser|chrome" "microsoft-edge|edge" "brave-browser|brave" "vivaldi|vivaldi" "opera|opera"; do
      cmd="${pair%%|*}"
      scheme="${pair##*|}"
      if command -v "$cmd" >/dev/null 2>&1; then
        ("$cmd" "$scheme://extensions" >/dev/null 2>&1 &)
        say "Opened $cmd on its extensions page."
        return 0
      fi
    done
  fi
  return 1
}

# The app (macOS) or commands (Linux) of a browser, and its extensions page; nothing for a browser it cannot open.
app_of() {
  case "$1" in
    chrome) printf '%s\n' "Google Chrome|google-chrome google-chrome-stable chromium chromium-browser|chrome" ;;
    edge) printf '%s\n' "Microsoft Edge|microsoft-edge microsoft-edge-stable|edge" ;;
    brave) printf '%s\n' "Brave Browser|brave-browser|brave" ;;
    arc) printf '%s\n' "Arc||chrome" ;;
    opera) printf '%s\n' "Opera|opera|opera" ;;
    vivaldi) printf '%s\n' "Vivaldi|vivaldi vivaldi-stable|vivaldi" ;;
    firefox) printf '%s\n' "Firefox|firefox|" ;;
  esac
}
name_of() {
  case "$1" in chrome) echo Chrome ;; edge) echo Edge ;; brave) echo Brave ;; arc) echo Arc ;; opera) echo Opera ;; vivaldi) echo Vivaldi ;; firefox) echo Firefox ;; esac
}

# Opens one browser at an address, if it is on this computer. With STUDY_DUO_NO_OPEN (tests), says what it would open.
open_in() { # $1: browser key, $2: address
  spec="$(app_of "$1")"
  app="${spec%%|*}"
  rest="${spec#*|}"
  cmds="${rest%|*}"
  if [ "$(uname -s)" = "Darwin" ]; then
    [ -d "/Applications/$app.app" ] || [ -d "$HOME/Applications/$app.app" ] || [ -n "${STUDY_DUO_FAKE_APPS:-}" ] || return 1
    if [ -n "${STUDY_DUO_NO_OPEN:-}" ]; then say "Would open $(name_of "$1") at $2"; return 0; fi
    open -a "$app" "$2" 2>/dev/null
    return
  fi
  for cmd in $cmds; do
    if command -v "$cmd" >/dev/null 2>&1 || [ -n "${STUDY_DUO_FAKE_APPS:-}" ]; then
      if [ -n "${STUDY_DUO_NO_OPEN:-}" ]; then say "Would open $(name_of "$1") at $2"; return 0; fi
      ("$cmd" "$2" >/dev/null 2>&1 &)
      return 0
    fi
  done
  return 1
}

# Each browser named with --browsers: its extensions page, or for Firefox the signed add-on. Prints what happened.
open_picked() { # $1: space-separated keys
  chromium=0
  for b in $1; do
    if [ "$b" = firefox ]; then
      if ! download_check "$XPI_URL"; then say "Firefox: the signed add-on is not published yet, so Firefox was skipped."
      elif open_in firefox "$XPI_URL"; then say "Opened Firefox: click Allow, then Add."
      else say "Firefox is not installed here, so it was skipped."
      fi
      continue
    fi
    scheme="$(app_of "$b")"
    scheme="${scheme##*|}"
    if open_in "$b" "$scheme://extensions"; then say "Opened $(name_of "$b") on its extensions page."; chromium=$((chromium + 1))
    else say "$(name_of "$b") is not installed here, so it was skipped."
    fi
  done
  [ "$chromium" -gt 0 ]
}

download_check() {
  if command -v curl >/dev/null 2>&1; then curl -fsIL --max-time 10 "$1" >/dev/null 2>&1
  else wget -q --spider "$1" >/dev/null 2>&1
  fi
}

# Where each Chromium browser looks for native messaging hosts, one per line.
host_dirs() {
  if [ "$(uname -s)" = "Darwin" ]; then
    base="$HOME/Library/Application Support"
    for b in "Google/Chrome" "Google/Chrome Beta" "Chromium" "Microsoft Edge" "BraveSoftware/Brave-Browser" "Vivaldi"; do printf '%s\n' "$base/$b/NativeMessagingHosts"; done
  else
    base="${XDG_CONFIG_HOME:-$HOME/.config}"
    for b in "google-chrome" "google-chrome-beta" "chromium" "microsoft-edge" "BraveSoftware/Brave-Browser" "vivaldi"; do printf '%s\n' "$base/$b/NativeMessagingHosts"; done
  fi
}

# Checks a downloaded file against SHA256SUMS; stops the install if it does not match.
verify() {
  expected="$(awk -v f="$1" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")"
  [ -n "$expected" ] || fail "the checksum file does not list $1. Nothing was installed."
  [ "$expected" = "$(sha256_of "$tmp/$1")" ] || fail "$1 does not match its checksum. Nothing was installed."
}

install_helper() {
  download "$BASE/$HELPER" "$tmp/$HELPER" || fail "could not download $BASE/$HELPER."
  verify "$HELPER"
  # The helper runs outside the browser, so it gets the same proof of origin as the extension when gh can check it.
  if [ -z "${STUDY_DUO_BASE_URL:-}" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh attestation verify "$tmp/$HELPER" --repo "$REPO" >/dev/null 2>&1 || fail "GitHub could not confirm the helper was built from the Study Duo repository. It was not installed."
  fi
  mkdir -p "$HELPER_DIR"
  cp "$tmp/$HELPER" "$HELPER_DIR/$HELPER"
  chmod 755 "$HELPER_DIR/$HELPER"
  path_json="$(printf '%s' "$HELPER_DIR/$HELPER" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  registered=0
  # The loop reads from a here-document so registered survives it (a pipe would run it in a subshell).
  while IFS= read -r dir; do
    [ -d "$(dirname "$dir")" ] || continue # that browser has no profile here
    mkdir -p "$dir"
    printf '{\n  "name": "%s",\n  "description": "Study Duo desktop helper: what desktop music apps are playing",\n  "path": "%s",\n  "type": "stdio",\n  "allowed_origins": ["chrome-extension://%s/"]\n}\n' "$HOST" "$path_json" "$EXTENSION_ID" > "$dir/$HOST.json"
    registered=$((registered + 1))
  done <<EOF_DIRS
$(host_dirs)
EOF_DIRS
  if [ "$registered" -gt 0 ]; then
    say "Desktop helper installed for $registered browser(s). Turn on Desktop apps in Study Duo's Connections to use it."
  else
    say "Desktop helper installed, but no Chrome, Chromium, Edge, Brave or Vivaldi profile was found to register it with."
  fi
}

uninstall_helper() {
  while IFS= read -r dir; do rm -f "$dir/$HOST.json"; done <<EOF_DIRS
$(host_dirs)
EOF_DIRS
  if [ -d "$HELPER_DIR" ]; then
    rm -rf "$HELPER_DIR"
    say "Removed the desktop helper."
  fi
}

uninstall() {
  uninstall_helper
  if [ -d "$DEST" ]; then
    rm -rf "$DEST"
    rmdir "$HOME_DIR" 2>/dev/null || true
    say "Removed $DEST."
  else
    say "Nothing to remove: $DEST does not exist."
  fi
  say "Last step: on your browser's extensions page, click Remove on the Study Duo card."
}

main() {
  with_helper=""
  picked=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --uninstall) uninstall; return 0 ;;
      --helper) with_helper=1 ;;
      --browsers)
        [ $# -ge 2 ] || fail "--browsers needs a list, for example --browsers chrome,firefox."
        for b in $(printf '%s' "$2" | tr ',' ' '); do
          case " $BROWSERS " in *" $b "*) picked="$picked $b" ;; *) fail "unknown browser $b (use: $(printf '%s' "$BROWSERS" | tr ' ' ','))." ;; esac
        done
        shift ;;
      *) fail "unknown option $1 (use --browsers, --helper or --uninstall)." ;;
    esac
    shift
  done
  # Only Firefox: it installs from its signed file, so the Chromium folder is not needed.
  if [ -n "$picked" ] && [ "$(printf '%s' "$picked" | tr -d ' ')" = firefox ]; then
    open_picked firefox || true
    return 0
  fi
  if grep -qi microsoft /proc/version 2>/dev/null; then
    fail "this looks like WSL. Run the Windows line in PowerShell instead: powershell -c \"irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex\""
  fi
  command -v unzip >/dev/null 2>&1 || fail "needs unzip (for example: sudo apt install unzip)."
  check_base

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT INT TERM

  say "Downloading Study Duo..."
  download "$BASE/$ZIP" "$tmp/$ZIP" || fail "could not download $BASE/$ZIP."
  download "$BASE/SHA256SUMS" "$tmp/SHA256SUMS" || fail "could not download the checksums."

  verify "$ZIP"
  say "Checksum matches."

  if [ -z "${STUDY_DUO_BASE_URL:-}" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh attestation verify "$tmp/$ZIP" --repo "$REPO" >/dev/null 2>&1 || fail "GitHub could not confirm this file was built from the Study Duo repository. Nothing was installed."
    say "GitHub confirms it was built from github.com/$REPO."
  fi

  mkdir -p "$HOME_DIR"
  rm -rf "$DEST.new"
  unzip -q "$tmp/$ZIP" -d "$DEST.new"
  [ -f "$DEST.new/manifest.json" ] || { rm -rf "$DEST.new"; fail "the download is not a Study Duo build. Nothing was installed."; }
  rm -rf "$DEST"
  mv "$DEST.new" "$DEST"

  say ""
  say "Study Duo is ready in:"
  say "  $DEST"
  if copy_path "$DEST"; then say "(That path is on your clipboard.)"; fi
  if [ -n "$picked" ]; then
    open_picked "$picked" || say "None of the browsers you picked for the folder is on this computer."
  else
    open_extensions || say "Open your browser's extensions page (for example chrome://extensions)."
  fi
  say ""
  [ -z "$with_helper" ] || install_helper
  say ""
  say "In each Chromium browser, three clicks left, once:"
  say "  1. Turn on Developer mode (top right of the extensions page)."
  say "  2. Click Load unpacked."
  say "  3. Choose the folder above. On a Mac, press Cmd+Shift+G in that window and paste the path."
  say ""
  say "To update later, run the same line again, then press reload on the Study Duo card. Your data stays."
}

# Everything runs from here, so a download cut off halfway never runs half a script.
main "$@"
