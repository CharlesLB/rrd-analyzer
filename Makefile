# Builds and checks for the RRD Analyzer workspace.
#
# The desktop target needs GTK and WebKit development headers; `make deps` names them for
# the current platform rather than failing halfway through a link step.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

UI_ANALYZER := pnpm --filter @rrd-analyzer/ui-analyzer
DAEMON := pnpm --filter @rrd-analyzer/daemon
DAEMON_DIR := packages/daemon
DESKTOP_DIR := $(DAEMON_DIR)/cmd/rrd-analyzer
BIN_DIR := $(DAEMON_DIR)/bin
EMBED_DIR := $(DESKTOP_DIR)/dist
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse HEAD 2>/dev/null || echo none)
COMMIT_DATE ?= $(shell git log -1 --format=%cI 2>/dev/null || echo unknown)
SHARE_SERVICE_URL ?=
TAG ?= $(shell git describe --tags --exact-match 2>/dev/null)

# `make publish v1.2.3` takes the word after publish as the tag and gives it an empty rule, so make
# does not go looking for a target by that name. TAG=v1.2.3 on the command line still wins.
ifeq ($(firstword $(MAKECMDGOALS)),publish)
PUBLISH_ARGUMENT := $(word 2,$(MAKECMDGOALS))
ifneq ($(PUBLISH_ARGUMENT),)
TAG := $(PUBLISH_ARGUMENT)
$(eval $(PUBLISH_ARGUMENT):;@:)
endif
endif

# The same identity goreleaser stamps, into the same package: version.Version without the tag's
# leading v, the full commit and the commit date. An -X naming a symbol that does not exist is
# silently ignored by the linker, which is how a local build used to report "dev" forever.
#
# SHARE_SERVICE_URL is the share service live sessions are published to, stamped the same way into
# shareservice.URL. Left empty, the build shares nothing and shows no share button.
VERSION_PACKAGE := github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version
SHARE_SERVICE_PACKAGE := github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/shareservice
LDFLAGS := -s -w \
	-X $(VERSION_PACKAGE).Version=$(VERSION:v%=%) \
	-X $(VERSION_PACKAGE).Commit=$(COMMIT) \
	-X $(VERSION_PACKAGE).Date=$(COMMIT_DATE) \
	-X $(SHARE_SERVICE_PACKAGE).URL=$(SHARE_SERVICE_URL)
GO_BUILD := go build -trimpath -ldflags '$(LDFLAGS)'

# The desktop build is the release build: the same tags goreleaser sets, so `make desktop` and
# what ships cannot link differently. `desktop` and `production` select the real WebKitGTK window
# and the embedded frontend; without them Wails compiles its stubs and the binary starts without
# drawing anything. webkit2_41 moves the cgo pkg-config from webkit2gtk-4.0, which Arch and every
# distribution on libsoup3 have dropped, and is a GTK concern only.
DESKTOP_TAGS := desktop,production
WAILS_TAGS :=
ifeq ($(shell uname -s),Linux)
DESKTOP_TAGS := desktop,production,webkit2_41
WAILS_TAGS := -tags webkit2_41
endif

# Wails' own dev server defaults to 34115, which is where rrd-analyzer-dev serves the API the
# browser build calls. Left alone they collide: whichever starts second fails to bind, and a
# lingering Wails server answers /api requests with the dev page instead, which the browser then
# reports as a CORS error rather than as the wrong server. Wails moves, the API keeps its port.
WAILS_DEV_SERVER := 127.0.0.1:34116

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk -F':.*?## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install workspace dependencies
	pnpm install --frozen-lockfile

.PHONY: ui-analyzer
ui-analyzer: ## Build the app's interface into the daemon's embed directory
	$(UI_ANALYZER) build

.PHONY: daemon
daemon: ## Build the development server binary
	cd $(DAEMON_DIR) && $(GO_BUILD) -o bin/rrd-analyzer-dev ./cmd/rrd-analyzer-dev

.PHONY: desktop
desktop: ui-analyzer ## Build the desktop application (needs GTK/WebKit headers, see `make deps`)
	cd $(DESKTOP_DIR) && CGO_ENABLED=1 $(GO_BUILD) -tags '$(DESKTOP_TAGS)' -o ../../bin/rrd-analyzer .

.PHONY: build
build: ui-analyzer daemon ## Build everything that builds without native headers

.PHONY: dev
dev: ## Run the desktop app with live reload
	cd $(DESKTOP_DIR) && wails dev -devserver $(WAILS_DEV_SERVER) $(WAILS_TAGS)

.PHONY: test
test: ## Run the Go and TypeScript unit suites
	pnpm test

.PHONY: e2e
e2e: ## Run the end-to-end suites
	pnpm test:e2e

.PHONY: lint
lint: ## Lint everything
	pnpm lint

.PHONY: format
format: ## Format everything in place
	pnpm lint:fix

.PHONY: typecheck
typecheck: ## Type-check the TypeScript packages
	pnpm typecheck

.PHONY: design
design: ## Diff the running app against the reference screenshots
	$(UI_ANALYZER) design:check

.PHONY: icon
icon: ## Re-render the window, executable and browser icons from packaging/linux/rrd-analyzer.svg
	python3 tools/render-appicon.py

.PHONY: install-desktop
install-desktop: ## Install a local build so the desktop shows its icon (needs sudo)
	sudo tools/install-desktop-entry.sh $(CURDIR)/$(BIN_DIR)/rrd-analyzer

.PHONY: verify
verify: ## Everything CI runs
	pnpm verify

.PHONY: release
release: ## Build every release artefact this host can produce into dist/
	tools/release-local.sh

.PHONY: release-linux
release-linux: ## Build the Linux artefacts only (.deb + Arch .pkg.tar.zst + .tar.gz, needs GTK/WebKit headers)
	tools/release-local.sh linux-amd64 linux-arm64

.PHONY: release-windows
release-windows: ## Build the Windows artefacts only (.exe + .zip, and the installer if makensis is present)
	tools/release-local.sh windows

.PHONY: publish
publish: ## Tag HEAD, test, build and publish it as a GitHub release: make publish v1.2.3 (needs gh)
	tools/publish-release.sh $(TAG)

.PHONY: release-check
release-check: ## Validate every release configuration
	@for config in linux-amd64 linux-arm64 windows; do \
		goreleaser check --config .goreleaser.$$config.yaml || exit 1; \
	done

.PHONY: deps
deps: ## Print the native packages the desktop build needs
	@case "$$(uname -s)" in \
		Linux)  echo "build:   sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev"; \
		        echo "release: sudo apt install nsis osslsigncode   # windows installer + signing" ;; \
		Darwin) echo "build:   xcode-select --install" ;; \
		*)      echo "build:   WebView2 runtime https://developer.microsoft.com/microsoft-edge/webview2/" ;; \
	esac

.PHONY: clean
clean: ## Remove build output
	rm -rf $(BIN_DIR) $(DESKTOP_DIR)/build $(EMBED_DIR) packages/ui-analyzer/.angular dist
