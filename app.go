package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	imgutil "oreno-mindmap/internal/image"
	"oreno-mindmap/internal/mindmap"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App はWailsにバインドされるアプリケーション構造体
type App struct {
	ctx             context.Context
	currentFilePath string
	pendingFilePath string // ダブルクリック起動時に渡されたファイルパス
	frontendReady   bool   // フロントエンドのEventOnリスナーが登録済みかどうか
}

// NewApp はApp インスタンスを返す
func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// コマンドライン引数に .orenomm ファイルが渡されているか確認（ダブルクリック起動時）
	for _, arg := range os.Args[1:] {
		if filepath.Ext(arg) == ".orenomm" {
			if _, err := os.Stat(arg); err == nil {
				a.pendingFilePath = arg
			}
			break
		}
	}
}

// GetPendingFile はダブルクリック起動時に渡されたファイルパスを返す（一度だけ返してクリア）
func (a *App) GetPendingFile() string {
	path := a.pendingFilePath
	a.pendingFilePath = ""
	return path
}

// SetFrontendReady はフロントエンドのEventOnリスナーが登録されたことをGo側に伝える
// フロントエンドがEventOnを登録した直後に呼ぶことで、以降のhandleFileOpenはイベントで通知される
func (a *App) SetFrontendReady() {
	a.frontendReady = true
}

// OpenFileByPath は指定パスのファイルを開く（ダブルクリック・Apple Event用）
func (a *App) OpenFileByPath(path string) (*mindmap.MindMap, error) {
	mm, err := mindmap.Load(path)
	if err != nil {
		return nil, err
	}
	a.currentFilePath = path
	return mm, nil
}

// --- ファイル操作 ---

// NewFile は新規マインドマップを作成して返す
func (a *App) NewFile() *mindmap.MindMap {
	a.currentFilePath = ""
	return mindmap.NewMindMap()
}

// OpenFile はファイルダイアログを開き、選択されたファイルを読み込む
func (a *App) OpenFile() (*mindmap.MindMap, error) {
	path, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "マインドマップを開く",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "MindMap (*.orenomm)", Pattern: "*.orenomm"},
		},
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil // キャンセル
	}
	mm, err := mindmap.Load(path)
	if err != nil {
		return nil, err
	}
	a.currentFilePath = path
	return mm, nil
}

// SaveFile は現在のパスにYAML保存する。パスが未設定なら SaveAsFile に委譲する
func (a *App) SaveFile(mm *mindmap.MindMap) (string, error) {
	if a.currentFilePath == "" {
		return a.SaveAsFile(mm)
	}
	if err := mindmap.Save(mm, a.currentFilePath); err != nil {
		return "", err
	}
	return a.currentFilePath, nil
}

// SaveAsFile はファイルダイアログで保存先を選択して保存する
func (a *App) SaveAsFile(mm *mindmap.MindMap) (string, error) {
	path, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "名前をつけて保存",
		DefaultFilename: fmt.Sprintf("mindmap-%s.orenomm", time.Now().Format("20060102")),
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "MindMap (*.orenomm)", Pattern: "*.orenomm"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // キャンセル
	}
	if err := mindmap.Save(mm, path); err != nil {
		return "", err
	}
	a.currentFilePath = path
	return path, nil
}

// ExportMarkdown はMarkdown形式でファイルにエクスポートする
func (a *App) ExportMarkdown(mm *mindmap.MindMap) error {
	path, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "Markdownエクスポート",
		DefaultFilename: fmt.Sprintf("mindmap-%s.md", time.Now().Format("20060102")),
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Markdown (*.md)", Pattern: "*.md"},
		},
	})
	if err != nil {
		return err
	}
	if path == "" {
		return nil // キャンセル
	}
	content := mindmap.ExportMarkdown(mm)
	return os.WriteFile(path, []byte(content), 0600)
}

// GetCurrentFilePath は現在開いているファイルのパスを返す
func (a *App) GetCurrentFilePath() string {
	return a.currentFilePath
}

// --- 画像操作 ---

// LoadImageFile はファイルダイアログから画像を選択してBase64で返す
func (a *App) LoadImageFile() (string, error) {
	path, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "画像を選択",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "画像ファイル (*.png, *.jpg, *.jpeg, *.gif, *.webp)", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // キャンセル
	}
	return imgutil.LoadFromFile(path)
}

// GetClipboardImage はクリップボードの画像をBase64で返す
func (a *App) GetClipboardImage() (string, error) {
	return imgutil.GetFromClipboard()
}

// ImportResult はインポート結果を格納する
type ImportResult struct {
	FileName string           `json:"file_name"`
	Sheets   []*mindmap.Sheet `json:"sheets"`
}

// ImportFile はファイルダイアログを開き、選択されたファイルのシート一覧を返す
func (a *App) ImportFile() (*ImportResult, error) {
	path, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "インポートするファイルを選択",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "MindMap (*.orenomm)", Pattern: "*.orenomm"},
		},
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil // キャンセル
	}
	mm, err := mindmap.Load(path)
	if err != nil {
		return nil, err
	}
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	fileName := base[:len(base)-len(ext)]
	return &ImportResult{
		FileName: fileName,
		Sheets:   mm.Sheets,
	}, nil
}
