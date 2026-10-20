#!/usr/bin/env bash
#
# Applies an Authenticode signature to a Windows executable, if one is configured.
#
# A no-op when WINDOWS_SIGN_PKCS12 is unset, which is the point: the release runs unchanged on a
# machine with no certificate, and starts signing the day one is provided. Signing is what gives
# the binary a publisher for SmartScreen to accumulate reputation against; without it Windows
# warns on first run of every new version.
#
#   WINDOWS_SIGN_PKCS12   path to a .pfx / .p12 certificate
#   WINDOWS_SIGN_PASSWORD its password (optional)
#
# osslsigncode rather than signtool, so the Windows half keeps building on a Linux runner:
#
#   apt-get install -y osslsigncode
#
# Usage:  tools/sign-windows.sh <path-to-exe>
set -euo pipefail

readonly target="${1:?usage: sign-windows.sh <path-to-exe>}"

if [ -z "${WINDOWS_SIGN_PKCS12:-}" ]; then
  echo "sign-windows: no WINDOWS_SIGN_PKCS12 set, leaving $target unsigned" >&2
  exit 0
fi

if [ ! -f "$WINDOWS_SIGN_PKCS12" ]; then
  echo "sign-windows: WINDOWS_SIGN_PKCS12 points at $WINDOWS_SIGN_PKCS12, which does not exist" >&2
  exit 1
fi

if ! command -v osslsigncode > /dev/null 2>&1; then
  echo "sign-windows: osslsigncode is not installed, run apt-get install -y osslsigncode" >&2
  exit 1
fi

# osslsigncode cannot sign in place: it reads one file and writes another.
readonly signed="$target.signed"

osslsigncode sign \
  -pkcs12 "$WINDOWS_SIGN_PKCS12" \
  -pass "${WINDOWS_SIGN_PASSWORD:-}" \
  -n "RRD Analyzer" \
  -i "https://github.com/CharlesLB/rrd-analyzer" \
  -t "http://timestamp.digicert.com" \
  -in "$target" \
  -out "$signed"

mv -f "$signed" "$target"
echo "sign-windows: signed $target" >&2
