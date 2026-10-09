#!/bin/sh
# Publishes a GitHub Release from the files the release workflow built and attested for a tag, as whoever runs it
# (the repository owner), so the release is not authored by a bot. Checks every file before publishing.
# Usage: sh scripts/publish-release.sh v0.1.0
set -eu

TAG="${1:?usage: sh scripts/publish-release.sh vX.Y.Z}"
REPO="Coflazo/study-duo"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT INT TERM

RUN="$(gh run list -R "$REPO" --workflow release --branch "$TAG" --status success --limit 1 --json databaseId --jq '.[0].databaseId')"
[ -n "$RUN" ] || { echo "No successful release run for $TAG. Push the tag and wait for the release workflow." >&2; exit 1; }
gh run download "$RUN" -R "$REPO" -n release -D "$DIR"
# The Firefox file Mozilla signed, when the AMO keys were set for that run.
if gh run download "$RUN" -R "$REPO" -n firefox -D "$DIR/firefox" 2>/dev/null; then
  (cd "$DIR/firefox" && { sha256sum -c SHA256SUMS-firefox 2>/dev/null || shasum -a 256 -c SHA256SUMS-firefox; })
  cp "$DIR/firefox/study-duo-firefox.xpi" "$DIR/study-duo-firefox.xpi"
  echo "signed by Mozilla: study-duo-firefox.xpi"
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$DIR" && sha256sum -c SHA256SUMS)
else
  (cd "$DIR" && shasum -a 256 -c SHA256SUMS)
fi
for f in "$DIR"/study-duo-*; do
  gh attestation verify "$f" -R "$REPO" --source-ref "refs/tags/$TAG" --signer-workflow "$REPO/.github/workflows/release.yml" --deny-self-hosted-runners >/dev/null
  echo "attested: $(basename "$f")"
done

gh release create "$TAG" "$DIR"/study-duo-* "$DIR/SHA256SUMS" -R "$REPO" --title "Study Duo $TAG" --notes-file "$DIR/notes.md" --verify-tag
