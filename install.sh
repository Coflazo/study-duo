#!/bin/sh
# Study Duo installer for macOS and Linux.
# Read it before you run it: https://github.com/Coflazo/study-duo/blob/main/install.sh
#
# What it does, and nothing else:
#   1. downloads the latest release and its SHA256SUMS from github.com/Coflazo/study-duo over HTTPS,
#   2. stops unless the SHA-256 matches (and checks GitHub's build attestation when the GitHub CLI is signed in),
#   3. unzips it to "~/Study Duo/chromium" (a visible folder: no sudo, no admin rights),
#   4. copies that path to your clipboard and opens your browser's extensions page,
#   5. prints the three clicks left.
# Uninstall: sh install.sh --uninstall   (removes the folder; remove the card in your browser)

set -eu

REPO="Coflazo/study-duo"
DEFAULT_BASE="https://github.com/$REPO/releases/latest/download"
BASE="${STUDY_DUO_BASE_URL:-$DEFAULT_BASE}"
HOME_DIR="${STUDY_DUO_HOME:-$HOME/Study Duo}"
DEST="$HOME_DIR/chromium"
ZIP="study-duo-chromium.zip"

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

uninstall() {
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
  if [ "${1:-}" = "--uninstall" ]; then
    uninstall
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

  expected="$(awk -v f="$ZIP" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")"
  actual="$(sha256_of "$tmp/$ZIP")"
  [ -n "$expected" ] || fail "the checksum file does not list $ZIP. Nothing was installed."
  [ "$expected" = "$actual" ] || fail "the download does not match its checksum. Nothing was installed."
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
  open_extensions || say "Open your browser's extensions page (for example chrome://extensions)."
  say ""
  say "Three clicks left, once:"
  say "  1. Turn on Developer mode (top right of the extensions page)."
  say "  2. Click Load unpacked."
  say "  3. Choose the folder above. On a Mac, press Cmd+Shift+G in that window and paste the path."
  say ""
  say "To update later, run the same line again, then press reload on the Study Duo card. Your data stays."
}

# Everything runs from here, so a download cut off halfway never runs half a script.
main "$@"
