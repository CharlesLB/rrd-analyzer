#!/usr/bin/env bash
#
# Fails when the arm64 build of the insights engine contains a fused multiply-add.
#
# internal/insights/usecase/signal writes every product that is later added to or compared with
# something as float64(a*b): the explicit conversion rounds the product, which stops the compiler
# fusing the multiply and the add into one instruction, so a bar comes out the same on every machine.
# amd64 never fuses, so the golden tests, which run there, cannot notice a product that lost its
# conversion. The arm64 assembly shows it, and reading that needs neither an arm64 machine nor an
# emulator: the compiler prints it for any GOARCH.
#
# Deliberately does not change directory, like golangci-lint.sh: package.json runs it from
# packages/daemon.
set -euo pipefail

readonly PACKAGES=./internal/insights/...
readonly FUSED_INSTRUCTION='[[:space:]]F(N)?M(ADD|SUB)[DS][[:space:]]'

assembly="$(GOARCH=arm64 go build -gcflags=-S "$PACKAGES" 2>&1)"
fused="$(grep -E "$FUSED_INSTRUCTION" <<< "$assembly" | grep -oE '\([^()]+\.go:[0-9]+\)' | sed -e "s|^($PWD/||" -e 's|)$||' | sort -u || true)"

if [ -n "$fused" ]; then
  echo "fused multiply-add in the arm64 build; write each product as float64(a*b):" >&2
  echo "$fused" >&2
  exit 1
fi
