#!/usr/bin/env bash
set -euo pipefail

# Regenerates electron-builder icon assets from design/assets/logo-mark.svg.
# Requires macOS (uses sips + iconutil). Run from repo root:
#   ./build/generate-icons.sh

SRC="design/assets/logo-mark.svg"
BUILD_DIR="build"
ICONSET="$BUILD_DIR/icon.iconset"

if [[ ! -f "$SRC" ]]; then
  echo "source SVG not found: $SRC" >&2
  exit 1
fi

mkdir -p "$ICONSET"

declare -a SIZES=(
  "16 icon_16x16.png"
  "32 icon_16x16@2x.png"
  "32 icon_32x32.png"
  "64 icon_32x32@2x.png"
  "128 icon_128x128.png"
  "256 icon_128x128@2x.png"
  "256 icon_256x256.png"
  "512 icon_256x256@2x.png"
  "512 icon_512x512.png"
  "1024 icon_512x512@2x.png"
)

for entry in "${SIZES[@]}"; do
  size="${entry%% *}"
  name="${entry##* }"
  sips -s format png -z "$size" "$size" "$SRC" --out "$ICONSET/$name" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$BUILD_DIR/icon.icns"
sips -s format png -z 1024 1024 "$SRC" --out "$BUILD_DIR/icon.png" >/dev/null

# Windows .ico - assemble PNG-embedded ICO from the standard Windows icon sizes.
# 16/32/128/256 already live in the iconset; render a 48 + 64 alongside them.
ICO_TMP="$BUILD_DIR/.ico-tmp"
mkdir -p "$ICO_TMP"
sips -s format png -z 48 48 "$SRC" --out "$ICO_TMP/48.png" >/dev/null
sips -s format png -z 64 64 "$SRC" --out "$ICO_TMP/64.png" >/dev/null
node "$BUILD_DIR/png-to-ico.mjs" "$BUILD_DIR/icon.ico" \
  "$ICONSET/icon_16x16.png" \
  "$ICONSET/icon_32x32.png" \
  "$ICO_TMP/48.png" \
  "$ICO_TMP/64.png" \
  "$ICONSET/icon_128x128.png" \
  "$ICONSET/icon_256x256.png"
rm -rf "$ICO_TMP"

echo "regenerated:"
echo "  $BUILD_DIR/icon.icns  (macOS)"
echo "  $BUILD_DIR/icon.ico   (Windows)"
echo "  $BUILD_DIR/icon.png   (linux + fallback)"
echo "  $BUILD_DIR/icon.iconset/  (source)"
