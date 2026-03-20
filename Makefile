.PHONY: dev build build-mac build-windows run clean test fmt

# アプリ名
BINARY_NAME=oreno-mindmap

# バージョン情報を埋め込むためのLDFLAGS
VERSION := $(shell git describe --tags --abbrev=0 2>/dev/null || echo "")
ifeq ($(strip $(VERSION)),)
$(warning git describe --tags --abbrev=0 failed; VERSION will be empty)
endif

#GCFLAGS=-gcflags="-m"
GCFLAGS=
LDFLAGS=-ldflags "-s -w -X main.appVersion=$(VERSION)"
STRIP=-trimpath -buildvcs=false

# ビルドターゲット（Wails）
dev:
	wails dev

build:
	wails build -clean -trimpath -ldflags="-s -w -X main.appVersion=$(VERSION)"

build-win:
	wails build -platform "windows/amd64" -trimpath -ldflags="-s -w -X main.appVersion=$(VERSION)" -nopackage

clean:
	rm -rf build/bin

fmt:
	go fmt ./...
	cd frontend && npm run lint 2>/dev/null || true

# リント
lint:
	@echo "Linting..."
	@which golangci-lint > /dev/null || (echo "golangci-lint not installed. Installing..." && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	golangci-lint run ./...
