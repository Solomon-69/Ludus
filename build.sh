#!/usr/bin/env bash
# Builds Ludus.app with swiftc only (no Xcode project) and installs it to ~/Applications.
# Usage: ./build.sh [--no-install]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${LUDUS_OUT:-/private/tmp/ludus-build}"   # override with LUDUS_OUT=/some/dir
APP="$OUT/Ludus.app"
# Ad-hoc signature by default. Set SIGN_ID to your own identity (e.g. "Developer ID Application: ...") to sign properly.
# Optional personal identity kept out of git: a file named .signing holding SIGN_ID="...".
[ -f "$REPO/.signing" ] && . "$REPO/.signing"
SIGN_ID="${SIGN_ID:--}"
rm -rf "$OUT"; mkdir -p "$OUT"

# Icons: delete assets/Ludus.icns (and assets/Ludus.icon) to redraw them from make-icon.swift.
if [ ! -f "$REPO/assets/Ludus.icns" ] || [ ! -d "$REPO/assets/Ludus.icon" ]; then
  mkdir -p "$REPO/assets"
  swiftc -O -framework AppKit "$REPO/make-icon.swift" -o "$OUT/mkicon"
  "$OUT/mkicon" "$OUT"
  iconutil -c icns "$OUT/Ludus.iconset" -o "$REPO/assets/Ludus.icns"
  rm -rf "$REPO/assets/Ludus.icon"; cp -R "$OUT/Ludus.icon" "$REPO/assets/Ludus.icon"
fi

# Light/dark app icon for macOS 26+: compile the Icon Composer file into Assets.car (CFBundleIconName).
# Needs full Xcode (actool). Without it, or on older macOS, the Ludus.icns above is used.
HAVE_CAR=0
if xcrun --find actool >/dev/null 2>&1; then
  mkdir -p "$OUT/car"
  if xcrun actool "$REPO/assets/Ludus.icon" --compile "$OUT/car" --platform macosx \
       --minimum-deployment-target 14.0 --app-icon Ludus \
       --output-partial-info-plist "$OUT/car/partial.plist" >/dev/null && [ -f "$OUT/car/Assets.car" ]; then
    HAVE_CAR=1
  else
    echo "Note: actool could not compile the light/dark icon; using Ludus.icns only." >&2
  fi
fi

# Local builds include the UI test hook; release builds (RELEASE=1, used by CI) leave it out.
TEST_FLAG="-DLUDUS_TEST"; [ "${RELEASE:-0}" = "1" ] && TEST_FLAG=""
# shellcheck disable=SC2086  # empty TEST_FLAG must expand to nothing (bash 3.2 safe)
swiftc -O -parse-as-library $TEST_FLAG -target arm64-apple-macos14.0 \
  -framework AppKit -framework WebKit -framework ServiceManagement \
  "$REPO"/Sources/*.swift -o "$OUT/Ludus"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$REPO/Info.plist" "$APP/Contents/Info.plist"
cp "$OUT/Ludus" "$APP/Contents/MacOS/Ludus"
cp "$REPO/assets/Ludus.icns" "$APP/Contents/Resources/Ludus.icns"
[ "$HAVE_CAR" = "1" ] && cp "$OUT/car/Assets.car" "$APP/Contents/Resources/Assets.car"
rsync -a --exclude '.DS_Store' --exclude '.harness-*' "$REPO/web/" "$APP/Contents/Resources/web/"
xattr -cr "$APP"
codesign --force --deep --sign "$SIGN_ID" "$APP" 2>/dev/null || codesign --force --deep --sign - "$APP"
echo "Built $APP"

if [ "${1:-}" != "--no-install" ]; then
  pkill -x Ludus 2>/dev/null || true
  rm -rf "$HOME/Applications/Ludus.app"
  ditto "$APP" "$HOME/Applications/Ludus.app"
  open -g "$HOME/Applications/Ludus.app"
  rm -rf "$APP"   # no second copy left behind for Spotlight to show
  echo "Installed ~/Applications/Ludus.app"
fi
