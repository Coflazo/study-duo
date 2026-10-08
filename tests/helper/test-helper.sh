#!/bin/sh
# Runs helper/study-duo-helper.sh with a fake now-playing source and checks Chrome's message format.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HELPER="$ROOT/helper/study-duo-helper.sh"
TAB=$(printf '\t')
die() { printf 'FAIL %s\n' "$1" >&2; exit 1; }
pass() { printf 'ok   %s\n' "$1"; }
decode() { python3 -c '
import json, struct, sys
b = sys.stdin.buffer.read()
out = []
while b:
    n = struct.unpack("<I", b[:4])[0]
    out.append(json.loads(b[4:4 + n].decode("utf-8")))
    b = b[4 + n:]
print(json.dumps(out, ensure_ascii=False))'; }
once() { STUDY_DUO_HELPER_ONCE=1 STUDY_DUO_HELPER_FAKE="$1" sh "$HELPER" </dev/null | decode; }

got=$(once "Says${TAB}Nils Frahm${TAB}Spaces${TAB}Music")
[ "$got" = '[{"kind": "now", "title": "Says", "artist": "Nils Frahm", "album": "Spaces", "app": "Music", "playing": true}]' ] || die "message: $got"
pass "sends one length-prefixed JSON message for the song playing"

got=$(once "Near \"Light\" \\ 1${TAB}Ólafur Arnalds${TAB}日本${TAB}VLC")
[ "$got" = '[{"kind": "now", "title": "Near \"Light\" \\ 1", "artist": "Ólafur Arnalds", "album": "日本", "app": "VLC", "playing": true}]' ] || die "escaping: $got"
pass "escapes quotes and backslashes and keeps non-ASCII text"

got=$(once "x${TAB}y${TAB}z${TAB}Chrome${TAB}w")
[ "$got" = '[{"kind": "now", "title": "", "artist": "", "album": "", "app": "", "playing": false}]' ] || die "extra fields: $got"
got=$(once "$(printf 'Evil\nrest\tb\tc\td')")
[ "$got" = '[{"kind": "now", "title": "", "artist": "", "album": "", "app": "", "playing": false}]' ] || die "line break: $got"
pass "a title with tabs or line breaks cannot choose the app it is filed under"

got=$(once none)
[ "$got" = '[{"kind": "now", "title": "", "artist": "", "album": "", "app": "", "playing": false}]' ] || die "nothing playing: $got"
pass "says so when nothing is playing"

# Without ONCE it keeps watching while its input is open, and stops soon after it closes, as when Chrome lets go.
start=$(date +%s)
sleep 3 | STUDY_DUO_HELPER_INTERVAL=1 STUDY_DUO_HELPER_FAKE="a${TAB}b${TAB}c${TAB}d" sh "$HELPER" >/dev/null
took=$(($(date +%s) - start))
[ "$took" -ge 3 ] || die "stopped after ${took}s while its input was still open"
[ "$took" -le 7 ] || die "kept running ${took}s after its input closed"
pass "keeps running while its input is open, and stops when it closes"
