#!/bin/sh
# Downloads the free versions of the extensions Study Duo is measured against, straight from the Chrome Web
# Store, and unpacks each into bench/.cache/<name>/unpacked (git-ignored: third-party code, never committed).
set -e
cd "$(dirname "$0")"
CACHE="$(pwd)/.cache"
for pair in leechblock:blaaajhemilngeeffpbfkdjjoefldkok blocksite:eiimnmioipafcokbfikbljfdeojpcgbh forest:kjacjjdnoddnpbbcjilcajfhhbdhkpgk; do
  name=${pair%%:*}
  id=${pair#*:}
  dir="${CACHE:?}/${name:?}"
  [ -d "$dir/unpacked" ] && continue
  mkdir -p "$dir"
  curl -fsSL -o "$dir/ext.crx" "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=141.0.0.0&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc"
  python3 -I uncrx.py "$dir/ext.crx" "$dir/unpacked"
  echo "$name: $(wc -c < "$dir/ext.crx" | tr -d ' ') bytes"
done
