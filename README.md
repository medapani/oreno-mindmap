# Oreno MindMap

Go / Wails v2 + React TypeScript で作ったデスクトップ向けマインドマップアプリ。
データは YAML ファイルで保存し、Markdown へのエクスポートにも対応する。

---

## 機能

- **複数シート対応**（Excelライクなシートタブ切り替え・追加・削除・リネーム）
- **複数ルートノード対応**のマインドマップ作成・編集
- ノードの **ドラッグ＆ドロップ** による自由配置
- ノードへの **画像添付**（ファイル選択 / クリップボード貼り付け）
- ノードカラーの個別変更（**カラーピッカー**）
- ノードの**折りたたみ / 展開**
- **Undo / Redo**（Cmd/Ctrl+Z / Shift+Z）
- **独自形式 (`.orenomm`)** でのファイル保存・読み込み
- 別ファイルからのシート**インポート**（`.orenomm` / `.md`）
- **Markdown 形式**へのエクスポート
- キーボードショートカット対応

---

## 技術スタック

| 層 | 技術 |
|---|---|
| デスクトップシェル | [Wails v2](https://wails.io/) v2.11.0 |
| バックエンド | Go 1.24 |
| フロントエンド | React 18 + TypeScript + Vite 3 |
| UI スタイル | Tailwind CSS v3 (PostCSS 経由) |
| 状態管理 | Zustand |
| グラフ描画 | @xyflow/react (React Flow) |
| ファイル操作 | gopkg.in/yaml.v3 |
| クリップボード | golang.design/x/clipboard |

---

## ディレクトリ構造

```
oreno-mindmap/
├── main.go                  # Wails エントリポイント (1400×900)
├── app.go                   # フロントエンドに公開する Go メソッド群
├── go.mod / go.sum
├── wails.json
├── Makefile
├── internal/
│   ├── mindmap/
│   │   ├── model.go         # Node / Sheet / MindMap 構造体
│   │   ├── yaml.go          # .orenomm シリアライズ / デシリアライズ
│   │   └── export.go        # Markdown エクスポート
│   └── image/
│       └── image.go         # Base64 変換・クリップボード画像取得
└── frontend/src/
    ├── types/mindmap.ts      # TypeScript 型定義
    ├── api/wailsClient.ts    # Wails バインディングラッパー
    ├── store/mindmapStore.ts # Zustand 状態管理
    ├── utils/
    │   └── treeUtils.ts      # ノードツリー操作ユーティリティ
    ├── hooks/
    │   └── useKeyboard.ts    # キーボードショートカット
    └── components/
        ├── MindMapCanvas.tsx # React Flow キャンバス
        ├── MindMapNode.tsx   # カスタムノードコンポーネント
        ├── SheetTabs.tsx     # シートタブ UI
        ├── Toolbar.tsx       # ツールバー
        ├── ContextMenu.tsx   # 右クリックメニュー
        └── ColorPicker.tsx   # カラーピッカー
```

---

## 前提条件

- Go 1.24 以上
- Node.js 18 以上 / npm
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

インストール確認:

```bash
wails doctor
```

---

## セットアップ

```bash
git clone <repo-url>
cd oreno-mindmap

# Go 依存関係
go mod download

# フロントエンド依存関係
cd frontend && npm install && cd ..
```

---

## 開発・ビルド

| コマンド | 内容 |
|---|---|
| `make dev` | ホットリロードで開発サーバー起動 (`wails dev`) |
| `make build` | macOS 向けリリースビルド |
| `make build-win` | Windows (amd64) 向けビルド (`-nopackage`) |
| `make clean` | `build/bin` を削除 |
| `make fmt` | Go + フロントエンドのフォーマット |
| `make lint` | golangci-lint 実行 |

ビルド成果物は `build/bin/` に出力される。

---

## データフォーマット (YAML)

ファイル拡張子は `.orenomm`（内部はgzip圧縮された YAML 形式）。

```yaml
version: "1"
created_at: "2026-01-01T00:00:00Z"
updated_at: "2026-01-01T00:00:00Z"
active_sheet_id: "sheet-1"
sheets:
  - id: "sheet-1"
    name: "Sheet 1"
    roots:
      - id: "node-1"
        label: "ルートノード"
        color: "#4f86f7"
        x: 100.0
        y: 200.0
        collapsed: false
        children:
          - id: "node-2"
            label: "子ノード"
            color: "#f7a24f"
            x: 300.0
            y: 150.0
```

---

## Go バインディング (app.go)

フロントエンドから呼び出せる主要メソッド:

| メソッド | 説明 |
|---|---|
| `NewFile()` | 新規マインドマップを作成 |
| `OpenFile()` | ファイルダイアログで `.orenomm` を開く |
| `SaveFile(mm)` | 現在のパスに保存（未設定時は SaveAsFile に委譲） |
| `SaveAsFile(mm)` | 名前をつけて `.orenomm` 保存 |
| `ExportMarkdown(mm)` | Markdown ファイルとしてエクスポート |
| `GetCurrentFilePath()` | 現在開いているファイルパスを返す |
| `ImportFile()` | `.orenomm` または `.md` を読み込み、シートとしてインポート |
| `LoadImageFile()` | ファイルダイアログで画像を Base64 で読み込む |
| `GetClipboardImage()` | クリップボードの画像を Base64 で取得 |

---

## キーボードショートカット

| キー | 動作 |
|---|---|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + S` | 上書き保存 |
| `Cmd/Ctrl + N` | 新規作成 |
| `Cmd/Ctrl + O` | ファイルを開く |
| `Delete / Backspace` | 選択ノードを削除 |
