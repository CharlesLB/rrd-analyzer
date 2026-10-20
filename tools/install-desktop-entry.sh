#!/usr/bin/env bash
#
# Installs a locally built binary the way the .deb would, which is what a desktop needs before
# it will draw the application's icon: the executable on PATH, the entry in the directory the
# session actually watches, and the icon in the hicolor theme.
#
# ~/.local/share is deliberately not used. WSLg's application list watches /usr/share/applications
# and /var/lib/snapd/desktop/applications only, so an entry under the home directory is never
# seen and the title bar keeps its blank icon.
#
# Usage: sudo tools/install-desktop-entry.sh [binary]
#
# The binary defaults to where `make desktop` writes it; `make install-desktop` passes that same
# path explicitly, so the two cannot drift apart again.
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="${1:-$REPOSITORY_ROOT/packages/daemon/bin/rrd-analyzer}"
ENTRY="$REPOSITORY_ROOT/packaging/linux/Rrd-analyzer.desktop"
ICON="$REPOSITORY_ROOT/packaging/linux/rrd-analyzer.svg"

if [ "$(id -u)" -ne 0 ]; then
  echo "install-desktop-entry: run me with sudo, the target directories are root-owned" >&2
  exit 1
fi

if [ ! -x "$BINARY" ]; then
  echo "install-desktop-entry: no binary at $BINARY, run 'make desktop' first" >&2
  exit 1
fi

install -Dm755 "$BINARY" /usr/local/bin/rrd-analyzer
install -Dm644 "$ENTRY" "/usr/share/applications/$(basename "$ENTRY")"
install -Dm644 "$ICON" /usr/share/icons/hicolor/scalable/apps/rrd-analyzer.svg

command -v update-desktop-database >/dev/null && update-desktop-database /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true

echo "installed rrd-analyzer, $(basename "$ENTRY") and its icon"
