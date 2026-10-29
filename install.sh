#!/usr/bin/env bash
# One-line Mac installer for Ludus. Downloading with curl (not a browser) means macOS does not
# add its "cannot be verified" block. Usage:
#   curl -fsSL https://raw.githubusercontent.com/Solomon-69/Ludus/main/install.sh | bash
# Remove:  rm -rf ~/Applications/Ludus.app
set -euo pipefail
REPO="Solomon-69/Ludus"
DEST="${LUDUS_DEST:-$HOME/Applications}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
[ "$(uname -s)" = "Darwin" ] || { echo "This installer is for Mac. On Windows download Ludus-windows.zip from the releases page."; exit 1; }
BASE="https://github.com/$REPO/releases/latest/download"
echo "Downloading Ludus..."
curl -fsSL "$BASE/Ludus-mac.zip" -o "$TMP/Ludus-mac.zip"
curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TMP/SHA256SUMS.txt"
WANT="$(grep ' Ludus-mac.zip$' "$TMP/SHA256SUMS.txt" | awk '{print $1}')"
GOT="$(shasum -a 256 "$TMP/Ludus-mac.zip" | awk '{print $1}')"
[ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || { echo "Download check failed (checksum mismatch). Nothing was installed."; exit 1; }
mkdir -p "$DEST"
pkill -x Ludus 2>/dev/null || true
rm -rf "$DEST/Ludus.app"
ditto -x -k "$TMP/Ludus-mac.zip" "$DEST"
xattr -dr com.apple.quarantine "$DEST/Ludus.app" 2>/dev/null || true
codesign --force --deep --sign - "$DEST/Ludus.app" 2>/dev/null || true
echo "Installed $DEST/Ludus.app"
[ -n "${LUDUS_NO_OPEN:-}" ] || open "$DEST/Ludus.app"
