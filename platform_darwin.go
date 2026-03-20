//go:build darwin

package main

import (
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// getMacOptions はmacOS固有のWailsオプションを返す
func getMacOptions(app *App) *mac.Options {
	return &mac.Options{
		OnFileOpen: app.handleFileOpen,
	}
}

// handleFileOpen はmacOSのファイルオープンApple Eventを受け取る（アプリ起動中のダブルクリック）
func (a *App) handleFileOpen(filePath string) {
	if filePath == "" || filepath.Ext(filePath) != ".orenomm" {
		return
	}
	if !a.frontendReady {
		// フロントエンドのリスナーがまだ未登録 → pendingFilePath に積む
		a.pendingFilePath = filePath
		return
	}
	// フロントエンド準備済み → イベントで即通知
	wailsRuntime.EventsEmit(a.ctx, "fileOpen", filePath)
}
