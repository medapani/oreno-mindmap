package mindmap

import (
	"fmt"
	"strings"
	"time"
)

// ImportMarkdown はMarkdownテキストを解析し、1枚のSheetに変換する。
//
// 変換ルール:
//   - `# Heading` 〜 `###### Heading` → 見出し深さに応じたノード（深さ1がルート候補）
//   - `- item` / `  - child` → リストアイテム（インデントで階層化）
//   - 空行・画像行は無視
//
// 見出しとリストの深さは統一スタックで管理し、リスト全体を見出しより
// 深いものとして扱う（listDepth = 100 + raw_indent_bytes）。
func ImportMarkdown(content string, sheetName string) *Sheet {
	// CR+LF を LF に正規化
	content = strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(content, "\n")

	type stackEntry struct {
		node  *Node
		depth int // 見出し: 1〜6、リスト: 100+インデント文字数
	}

	var roots []*Node
	var stack []stackEntry
	idCounter := 0

	newNode := func(label, color string) *Node {
		idCounter++
		return &Node{
			ID:    fmt.Sprintf("imp-%d", idCounter),
			Label: label,
			Color: color,
		}
	}

	for _, line := range lines {
		stripped := strings.TrimSpace(line)
		if stripped == "" {
			continue
		}
		// 画像行をスキップ
		if strings.HasPrefix(stripped, "![") {
			continue
		}

		// ─── 見出し判定 ───────────────────────────────────────────
		if strings.HasPrefix(line, "#") {
			depth := 0
			for _, ch := range line {
				if ch == '#' {
					depth++
				} else {
					break
				}
			}
			if depth >= 1 && depth <= 6 && len(line) > depth && line[depth] == ' ' {
				label := strings.TrimSpace(line[depth+1:])
				if label == "" {
					continue
				}
				node := newNode(label, headingColor(depth))

				// depth より深いエントリをスタックから取り除く
				for len(stack) > 0 && stack[len(stack)-1].depth >= depth {
					stack = stack[:len(stack)-1]
				}

				if len(stack) == 0 {
					roots = append(roots, node)
				} else {
					parent := stack[len(stack)-1].node
					parent.Children = append(parent.Children, node)
				}
				stack = append(stack, stackEntry{node, depth})
				continue
			}
		}

		// ─── リストアイテム判定 ───────────────────────────────────
		// 先頭スペース/タブの数をインデントレベルとして使う
		trimmed := strings.TrimLeft(line, " \t")
		indent := len(line) - len(trimmed)

		var listPrefix string
		if strings.HasPrefix(trimmed, "- ") {
			listPrefix = "- "
		} else if strings.HasPrefix(trimmed, "* ") {
			listPrefix = "* "
		}
		if listPrefix == "" {
			continue
		}

		label := strings.TrimSpace(trimmed[len(listPrefix):])
		// 画像だけのリスト行は無視
		if label == "" || strings.HasPrefix(label, "![") {
			continue
		}

		node := newNode(label, "#94A3B8")
		// リスト深さ: 見出し最大(6) より必ず大きい値域を使う
		listDepth := 100 + indent

		for len(stack) > 0 && stack[len(stack)-1].depth >= listDepth {
			stack = stack[:len(stack)-1]
		}

		if len(stack) == 0 {
			roots = append(roots, node)
		} else {
			parent := stack[len(stack)-1].node
			parent.Children = append(parent.Children, node)
		}
		stack = append(stack, stackEntry{node, listDepth})
	}

	if len(roots) == 0 {
		roots = []*Node{{
			ID:    "imp-root",
			Label: sheetName,
			Color: "#60A5FA",
		}}
	}

	return &Sheet{
		ID:    fmt.Sprintf("sheet-imp-%d", time.Now().UnixNano()),
		Name:  sheetName,
		Roots: roots,
	}
}

// headingColor は見出し深さ(1〜6)に応じたノード色を返す
func headingColor(depth int) string {
	colors := []string{
		"#60A5FA", // h1: 青
		"#93C5FD", // h2: 薄青
		"#6EE7B7", // h3: 緑
		"#FCD34D", // h4: 黄
		"#F9A8D4", // h5: ピンク
		"#A5B4FC", // h6: 紫
	}
	if depth >= 1 && depth <= len(colors) {
		return colors[depth-1]
	}
	return "#94A3B8"
}
