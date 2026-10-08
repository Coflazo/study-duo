#!/bin/sh
# Exercises install.sh against a local release server: install, update, tampered download, wrong zip, piped, uninstall.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'kill "$SERVER" 2>/dev/null || true; rm -rf "$WORK"' EXIT
REL="$WORK/release"
mkdir -p "$REL" "$WORK/src"
pass() { printf 'ok   %s\n' "$*"; }
die() { printf 'FAIL %s\n' "$*" >&2; exit 1; }

sum() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1; else shasum -a 256 "$1" | cut -d ' ' -f 1; fi; }
release() { # $1: version text inside manifest.json; $2: include manifest (yes/no)
  rm -rf "$WORK/src" && mkdir -p "$WORK/src"
  [ "$2" = yes ] && printf '{"name":"Study Duo","version":"%s"}' "$1" > "$WORK/src/manifest.json"
  printf 'x' > "$WORK/src/popup.html"
  (cd "$WORK/src" && rm -f "$REL/study-duo-chromium.zip" && zip -qr "$REL/study-duo-chromium.zip" .)
  printf '%s  study-duo-chromium.zip\n' "$(sum "$REL/study-duo-chromium.zip")" > "$REL/SHA256SUMS"
}

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
(cd "$REL" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
SERVER=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -fs "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.3; done

export STUDY_DUO_BASE_URL="http://127.0.0.1:$PORT" STUDY_DUO_HOME="$WORK/home/Study Duo" STUDY_DUO_NO_OPEN=1
DEST="$STUDY_DUO_HOME/chromium"

release 0.1.0 yes
sh "$ROOT/install.sh" >/dev/null
grep -q '"0.1.0"' "$DEST/manifest.json" || die "install"
pass "installs into a folder with a space in its path"

release 0.1.1 yes
sh "$ROOT/install.sh" >/dev/null
grep -q '"0.1.1"' "$DEST/manifest.json" || die "update"
pass "updates in place"

release 0.1.2 yes
printf '%s  study-duo-chromium.zip\n' "0000000000000000000000000000000000000000000000000000000000000000" > "$REL/SHA256SUMS"
if sh "$ROOT/install.sh" >/dev/null 2>&1; then die "accepted a bad checksum"; fi
grep -q '"0.1.1"' "$DEST/manifest.json" || die "a bad download touched the installed copy"
pass "refuses a download that does not match its checksum, and keeps the installed copy"

release 0.1.3 no
if sh "$ROOT/install.sh" >/dev/null 2>&1; then die "accepted a zip without a manifest"; fi
grep -q '"0.1.1"' "$DEST/manifest.json" || die "a wrong zip touched the installed copy"
[ ! -d "$DEST.new" ] || die "left a half-unpacked folder"
pass "refuses a zip that is not a Study Duo build"

release 0.1.4 yes
sh < "$ROOT/install.sh" >/dev/null
grep -q '"0.1.4"' "$DEST/manifest.json" || die "piped install"
pass "works piped into sh, as curl | sh does"

sh "$ROOT/install.sh" --uninstall >/dev/null
[ ! -d "$DEST" ] || die "uninstall"
pass "uninstalls"

if STUDY_DUO_BASE_URL="http://example.com/release" sh "$ROOT/install.sh" >/dev/null 2>&1; then die "accepted a plain-HTTP download address on another computer"; fi
[ ! -d "$DEST" ] || die "a refused address still installed"
pass "refuses a plain-HTTP download address that is not this computer"

# Desktop helper (--helper): installed next to the extension, registered with the browsers that have a profile.
export HOME="$WORK/fakehome"
if [ "$(uname -s)" = Darwin ]; then
  PROFILE="$HOME/Library/Application Support/Google/Chrome"
  NO_PROFILE="$HOME/Library/Application Support/Microsoft Edge"
else
  PROFILE="$HOME/.config/google-chrome"
  NO_PROFILE="$HOME/.config/microsoft-edge"
fi
mkdir -p "$PROFILE"
release 0.1.5 yes
cp "$ROOT/helper/study-duo-helper.sh" "$REL/study-duo-helper.sh"
printf '%s  study-duo-helper.sh\n' "$(sum "$REL/study-duo-helper.sh")" >> "$REL/SHA256SUMS"
sh "$ROOT/install.sh" --helper >/dev/null
H="$STUDY_DUO_HOME/helper/study-duo-helper.sh"
M="$PROFILE/NativeMessagingHosts/com.coflazo.study_duo.json"
[ -x "$H" ] || die "the helper was not installed"
python3 - "$M" "$H" <<'PY' || die "host manifest"
import json, sys
m = json.load(open(sys.argv[1]))
assert m["name"] == "com.coflazo.study_duo" and m["path"] == sys.argv[2] and m["type"] == "stdio", m
assert m["allowed_origins"] == ["chrome-extension://bcggiingdefmehpjcalkfpdnehpcieon/"], m
PY
[ ! -e "$NO_PROFILE/NativeMessagingHosts/com.coflazo.study_duo.json" ] || die "registered with a browser that has no profile"
pass "installs the desktop helper for Study Duo only, with the browsers that have a profile"

printf 'tampered' >> "$REL/study-duo-helper.sh"
if sh "$ROOT/install.sh" --helper >/dev/null 2>&1; then die "accepted a tampered helper"; fi
pass "refuses a helper that does not match its checksum"

sh "$ROOT/install.sh" --uninstall >/dev/null
if [ -e "$M" ] || [ -e "$H" ]; then die "uninstall left the helper behind"; fi
pass "uninstall removes the helper and its registration"
