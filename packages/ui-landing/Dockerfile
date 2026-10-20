# The site as static files behind nginx: the landing page at /, and the application at /app/, which
# runs in the visitor's browser on WebAssembly. It is deployed on its own, independent of the desktop
# application, and nothing in it receives or keeps a visitor's files.
#
# Built from the root of the repository, since the workspace lockfile, the web app and the Go core
# the browser app is compiled from all live there:
#
#   docker build --file packages/ui-landing/Dockerfile --tag rrd-analyzer-landing .
#
# The image serves on 8080 as an unprivileged user and holds nothing but the built site.

FROM golang:1.25-alpine AS go

FROM node:24-alpine AS build

COPY --from=go /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
RUN apk add --no-cache bash && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui-analyzer/package.json packages/ui-analyzer/
COPY packages/ui-landing/package.json packages/ui-landing/
COPY packages/daemon/package.json packages/daemon/
RUN pnpm install --frozen-lockfile --filter @rrd-analyzer/ui-landing... --filter @rrd-analyzer/ui-analyzer... --filter @rrd-analyzer/daemon

COPY packages/daemon/go.mod packages/daemon/go.sum packages/daemon/
COPY packages/daemon/cmd packages/daemon/cmd
COPY packages/daemon/internal packages/daemon/internal
COPY tools/build-browser-runtime.sh tools/
COPY packages/shared packages/shared
COPY packages/ui-analyzer packages/ui-analyzer
COPY packages/ui-landing packages/ui-landing
RUN pnpm --filter @rrd-analyzer/ui-landing build

FROM nginxinc/nginx-unprivileged:stable-alpine

COPY packages/ui-landing/nginx/landing.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/packages/ui-landing/dist/browser /usr/share/nginx/html

EXPOSE 8080
