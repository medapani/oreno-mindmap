# Plan: マインドマップアプリ (oreno-mindmap)

## TL;DR

Go/Wails v2 + React TypeScript + React Flow でデスクトップ向けマインドマップアプリを構築する。
macOS/Windows対応。データ層はGoに集約し、将来のWeb化を見越してWailsバインディングをフロントエンドから抽象化する。

---

## 技術スタック

| 層 | 技術 |
|---|---|
| デスクトップシェル | Wails v2 |
| バックエンド | Go 1.24+ |
| フロントエンド | React 18 + TypeScript + Vite |
| UIスタイル | Tailwind CSS |
| 状態管理 | Zustand |
| グラフ描画 | React Flow (@xyflow/react) |
| ファイル操作（Go） | go-yaml v3, 標準ライブラリ |
| クリップボード（Go） | golang.design/x/clipboard |

---

## ディレクトリ構造

```
oreno-mindmap/
├── main.go              # Wailsエントリポイント
├── app.go               # フロントエンドに公開するGoメソッド群
├── go.mod / go.sum
├── wails.json
├── Makefile
├── internal/
│   ├── mindmap/
│   │   ├── model.go     # Node, Tree構造体
│   │   ├── yaml.go      # YAML直列化/復元
│   │   └── export.go    # Markdownエクスポート
│   └── image/
│       └── image.go     # Base64変換、クリップボード画像取得
├── frontend/
│   ├── src/
│   │   ├── types/mindmap.ts         # TypeScript型定義
│   │   ├── api/wailsClient.ts       # Wailsバインディングラッパー（Web化時に差替）
│   │   ├── store/mindmapStore.ts    # Zustand状態管理
│   │   ├── hooks/
│   │   │   ├── useKeyboard.ts       # キーボードショートカット
│   │   │   └── useHistory.ts        # Undo/Redo履歴管理
│   │   ├── components/
│   │   │   ├── MindMapCanvas.tsx    # React Flowキャンバス
│   │   │   ├── MindMapNode.tsx      # カスタムノードコンポーネント
│   │   │   ├── Toolbar.tsx          # 上部ツールバー（保存/エクスポートなど）
│   │   │   ├── ColorPicker.tsx      # 10色カラーパレット
│   │   │   ├── ContextMenu.tsx      # 右クリックコンテキストメニュー
│   │   │   └── ImageAttachment.tsx  # 画像表示コンポーネント
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── build/
    └── appicon.png
```

---

## データモデル（Go）

```go
// internal/mindmap/model.go
type Node struct {
    ID       string  `yaml:"id"`
    Label    string  `yaml:"label"`
    Color    string  `yaml:"color"`    // 10色のうち1つ（hex）
    ImageB64 string  `yaml:"image,omitempty"` // Base64エンコード画像
    Children []*Node `yaml:"children,omitempty"`
    X        float64 `yaml:"x"` // レイアウト位置
    Y        float64 `yaml:"y"`
}

type MindMap struct {
    Version   string `yaml:"version"`
    CreatedAt string `yaml:"created_at"`
    Root      *Node  `yaml:"root"`
}
```

## Goバックエンド公開API（app.go）

| メソッド | 説明 |
|---|---|
| `OpenFile() (MindMap, error)` | ファイルダイアログ → YAML読み込み |
| `SaveFile(data MindMap, path string) error` | YAML書き込み |
| `SaveAsFile(data MindMap) (string, error)` | 名前をつけて保存ダイアログ |
| `ExportMarkdown(data MindMap) error` | Markdown形式でエクスポート |
| `GetClipboardImage() (string, error)` | クリップボードから画像をBase64で取得 |
| `LoadImageFile() (string, error)` | ファイルダイアログ → 画像Base64取得 |

---

## フロントエンド設計

### React Flowノード
- `MindMapNode.tsx` をカスタムノードとして登録
- ノード背景色 = Node.color（10色パレット）
- ノード内に画像があればサムネイル表示
- ダブルクリックでインライン編集（contentEditable）

### 状態管理（Zustand）
- `nodes[]`, `edges[]` をReact Flow形式で保持
- `history[]` でUndoスタック（最大100ステップ）
- ノード追加/削除/編集の都度 historyにpush

### 10色パレット
プリセット: `#F87171, #FB923C, #FBBF24, #4ADE80, #34D399, #22D3EE, #60A5FA, #A78BFA, #F472B6, #94A3B8`（Tailwind系統）

### キーボードショートカット
| キー | アクション |
|---|---|
| Tab | 選択ノードに子ノード追加 |
| Shift+Tab | ルートノードの場合は左側に子ノード追加 |
| Enter | 選択ノードに兄弟ノード追加 |
| Delete / Backspace | 選択ノードを削除（複数選択時は一括削除） |
| Alt+↑ / Alt+↓ | 兄弟内で順序を上下に移動 |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Y / Cmd+Shift+Z | Redo |
| Ctrl+S / Cmd+S | 上書き保存 |
| Ctrl+C / Cmd+C | 選択ノードをコピー |
| Ctrl+V / Cmd+V | クリップボード画像 or ノードの貼り付け |
| Space（長押し） | キャンバスパンモード（離すと選択モードに戻る） |

### 将来のWeb化対応
- Wailsバインディング呼び出しを `api/wailsClient.ts` に完全集約
- Web版では `api/httpClient.ts` に差し替えるだけでOK（oreno-tools-webパターン）
- GoのビジネスロジックはHTTPハンドラーで再公開できる形に `internal/` を設計

---

## 実装フェーズ

### Phase 1: プロジェクトセットアップ
1. `wails init -n oreno-mindmap -t react-ts` でWailsプロジェクト初期化
2. `oreno-mindmap/` 既存ファイル（main.go, go.mod）を上書きまたはマージ
3. `frontend/` に Tailwind CSS, Zustand, @xyflow/react を追加
4. `Makefile` に `dev`（wails dev）、`build`（wails build）ターゲット作成

### Phase 2: Goデータ層（internal/）
5. `internal/mindmap/model.go` — Node/MindMap構造体定義
6. `internal/mindmap/yaml.go` — YAML読み書き（go-yaml v3）
7. `internal/mindmap/export.go` — Markdownエクスポート（再帰的にヘッダー生成）
8. `internal/image/image.go` — ファイルをBase64変換 / クリップボード取得
   - macOS/Windows両対応: `golang.design/x/clipboard`

### Phase 3: Wails API層（app.go）
9. `app.go` に公開メソッド群を実装（Phase2のinternalを呼び出し）
10. Wailsバインディング自動生成（`wails dev`実行時に`wailsjs/`生成）

### Phase 4: TypeScript型定義 & APIラッパー（Phase 3と並行可）
11. `frontend/src/types/mindmap.ts` — GoのNode/MindMapに対応する型
12. `frontend/src/api/wailsClient.ts` — wailsjs/go/main/App.* をラップ

### Phase 5: 状態管理（Zustand）
13. `mindmapStore.ts` — nodes, edges, currentFilePath, isDirty, history管理
14. `useHistory.ts` — Undo/Redo hooks（最大100ステップ）
15. `useKeyboard.ts` — グローバルキーボードイベント登録

### Phase 6: マインドマップ描画（React Flow）
16. `MindMapCanvas.tsx` — React Flowキャンバス、カスタムノード登録、自動レイアウト
17. `MindMapNode.tsx` — カスタムノードUI（色、ラベル、画像、選択状態）
18. エッジスタイル（アニメーションなし、bezierカーブ）
19. ノード間の親変更（ドラッグ&ドロップでエッジ付け替え）

### Phase 7: UI操作機能
20. `ContextMenu.tsx` — 右クリックで「追加」「削除」「色変更」「画像追加」
21. `ColorPicker.tsx` — 10色パレットポップアップ
22. ダブルクリックによるインライン編集

### Phase 8: 画像機能
23. クリップボード貼り付け（Ctrl+V → GoのGetClipboardImage → ノードに埋め込み）
24. ファイルから画像追加（ContextMenu → GoのLoadImageFile）
25. `ImageAttachment.tsx` — ノード内画像サムネイル表示

### Phase 9: ファイル操作UI
26. Toolbar の保存・読み込みボタン → GoのOpenFile/SaveFile/SaveAsFile
27. Markdownエクスポートボタン → GoのExportMarkdown
28. 未保存変更の確認ダイアログ（window close / 新規時）

### Phase 10: UI仕上げ
29. Wailsカスタムタイトルバー（フレームレスウィンドウ）
30. タイトルバーにファイル名と未保存マーク（*）表示
31. 自動レイアウト機能（新規追加ノードの位置計算）
32. ミニマップ表示（React Flow組み込みMiniMap使用）
33. ノードグループ折り畳み（子ノードを一括表示/非表示）

---

## ファイル操作（YAML）

### 保存フォーマット例
```yaml
version: "1.0"
created_at: "2026-03-20T12:00:00Z"
root:
  id: "node-root"
  label: "中心テーマ"
  color: "#60A5FA"
  x: 0.0
  y: 0.0
  children:
    - id: "node-1"
      label: "アイデアA"
      color: "#4ADE80"
      image: "data:image/png;base64,iVBORw..."
      x: 200.0
      y: -100.0
      children: []
```

### Markdownエクスポート例
```markdown
# 中心テーマ
## アイデアA
### サブアイデア
## アイデアB
```

---

## 検証ステップ

1. `wails dev` でホットリロード開発環境起動確認
2. ノード追加 → Tab/Enterキー → 子/兄弟ノード生成
3. ノード数を100個以上作成しパフォーマンス確認（目標1万ノード対応）
4. YAML保存 → ファイル確認 → 読み込みでデータ一致確認
5. Markdownエクスポートでツリー構造が正しく出力されること
6. クリップボード画像貼り付け（macOS / Windows）
7. Undo/Redo 10回以上の操作
8. `wails build` でmacOS/Windowsバイナリ生成

---

## 決定事項

| 項目 | 決定内容 |
|---|---|
| ノード構造 | ツリー型（1ルート、無制限の深さ） |
| 描画ライブラリ | React Flow (@xyflow/react) |
| Undo/Redo | あり（最大100ステップ） |
| 対応OS | macOS + Windows |
| 将来のWeb化 | wailsClient.ts抽象化レイヤーで対応 |
| ノード上限 | 1万個（パフォーマンス要確認） |

## スコープ外（将来対応）

- Web版・共同編集機能
- クラウド保存
- ノード間のクロスリンク（グラフ構造）
- テーマ切り替え（ダーク/ライト以外）

---

## 実装状況

### 実装済み ✅

| ファイル | 状況 | 備考 |
|---|---|---|
| `main.go` | ✅ | Wailsエントリ、ウィンドウサイズ 1400x900 |
| `app.go` | ✅ | NewFile / OpenFile / SaveFile / SaveAsFile / ExportMarkdown / GetClipboardImage / LoadImageFile |
| `internal/mindmap/model.go` | ✅ | Node / MindMap 構造体 |
| `internal/mindmap/yaml.go` | ✅ | Load / Save (go-yaml v3) |
| `internal/mindmap/export.go` | ✅ | Markdownエクスポート |
| `internal/image/image.go` | ✅ | クリップボード画像取得 / ファイルBase64変換 |
| `frontend/src/types/mindmap.ts` | ✅ | TypeScript型定義 |
| `frontend/src/api/wailsClient.ts` | ✅ | Goバインディングラッパー |
| `frontend/src/store/mindmapStore.ts` | ✅ | Zustand状態管理 |
| `frontend/src/utils/treeUtils.ts` | ✅ | ツリー操作ユーティリティ |
| `frontend/src/hooks/useKeyboard.ts` | ✅ | キーボードショートカット |
| `frontend/src/components/MindMapCanvas.tsx` | ✅ | React Flowキャンバス |
| `frontend/src/components/MindMapNode.tsx` | ✅ | カスタムノードUI |
| `frontend/src/components/Toolbar.tsx` | ✅ | 上部ツールバー |
| `frontend/src/components/ColorPicker.tsx` | ✅ | 10色カラーパレット |
| `frontend/src/components/ContextMenu.tsx` | ✅ | 右クリックメニュー |
| `frontend/src/components/SheetTabs.tsx` | ✅ | シートタブUI（追加・削除・リネーム・複製・順序変更） |

### 未実装 ❌

| ファイル | 備考 |
|---|---|
| `frontend/src/hooks/useHistory.ts` | Undo/Redo（Phase 5で予定） |
| `frontend/src/components/ImageAttachment.tsx` | ノード内画像サムネイル（Phase 8で予定） |

---

## 作業ログ

### 2026-03-20
- プロジェクト初期構築完了（Wails v2.11.0 + Go 1.24 + React 18 + TypeScript）
- Tailwind v4 が Vite 3 と非互換のため **Tailwind v3 + PostCSS** に切り替え
- Goバックエンド（`internal/` 以下）および `app.go` の全APIを実装
- フロントエンド主要コンポーネント・ストア・フックを実装
- `wails dev` による開発環境起動を確認

#### 既知の注意点
- `create_file` ツールでGoファイルを作ると内容が破損することがある → `/tmp/write_go_files.py` などPythonスクリプトで書き直す
- `wails dev` 起動時に `address already in use 34115` が出たら前プロセスを kill する
- `wailsjs/` ディレクトリ（Goバインディング自動生成）は `wails dev` 初回実行時に生成される

### 2026-04-04
- シートの順番を入れ替える機能を追加
  - `store/mindmapStore.ts` に `moveSheetLeft(id)` / `moveSheetRight(id)` を追加
  - `SheetTabs.tsx` の右クリックメニューに「◀️ 左へ移動」「▶️ 右へ移動」を追加
  - 先頭シートでは左移動、末尾シートでは右移動を非表示にする制御を実装
- デフォルトをノード選択モードに変更、Space長押しでキャンバスパンモードに切り替え
  - `MindMapCanvas.tsx` に `isPanMode` state と Space キーの keydown/keyup ハンドラーを追加
  - `selectionOnDrag={!isPanMode}` / `panOnDrag={isPanMode}` をReactFlowに適用
  - パンモード中はカーソルが `cursor-grab` に変化
- 複数ノードの一括reparent機能を追加
  - `store/mindmapStore.ts` に `reparentMultipleNodes(nodeIds, newParentId, direction?)` を追加
  - Cmd+クリック（Mac）/ Ctrl+クリック（Windows）or ドラッグ選択で複数ノードを選択し、別ノードの上にドラッグするとまとめて子として移動
  - 選択ノードのうち他の選択ノードの子孫にあたるものは重複移動を防ぐため除外（祖先のみ移動）
  - ルートへのドロップ時は左右選択ダイアログを表示し全選択ノードを指定方向に移動
  - 1回の操作でUndoできるようにまとめてpushHistory
