package mindmap

import (
	"fmt"
	"strings"
)

// ExportMarkdown はマインドマップをMarkdown形式の文字列にエクスポートする
func ExportMarkdown(mm *MindMap) string {
	if mm == nil || len(mm.Sheets) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, sheet := range mm.Sheets {
		if len(mm.Sheets) > 1 {
			// 複数シートの場合はシート名を見出しとして出力する
			sb.WriteString(fmt.Sprintf("# %s\n\n", sheet.Name))
		}
		for _, root := range sheet.Roots {
			startDepth := 1
			if len(mm.Sheets) > 1 {
				startDepth = 2 // シート見出しが h1 のため子は h2 から
			}
			exportHeadingNode(&sb, root, startDepth)
		}
	}
	return sb.String()
}

// exportHeadingNode は見出しモードでノードをエクスポートする。
// 子が1つなら次の深さの見出し、複数ならリストに切り替える。
func exportHeadingNode(sb *strings.Builder, node *Node, depth int) {
	if node == nil {
		return
	}
	prefix := strings.Repeat("#", depth)
	sb.WriteString(fmt.Sprintf("%s %s\n\n", prefix, node.Label))
	if node.ImageB64 != "" {
		sb.WriteString(fmt.Sprintf("![image](%s)\n\n", node.ImageB64))
	}
	switch len(node.Children) {
	case 0:
		// 葉ノード: 何もしない
	case 1:
		exportHeadingNode(sb, node.Children[0], depth+1)
	default:
		for _, child := range node.Children {
			exportListNode(sb, child, 0)
		}
		sb.WriteString("\n")
	}
}

// exportListNode はリストモードでノードをエクスポートする。
// リストモードに入ったら子孫もすべてリスト（インデントで階層表現）。
func exportListNode(sb *strings.Builder, node *Node, indent int) {
	if node == nil {
		return
	}
	indentStr := strings.Repeat("  ", indent)
	sb.WriteString(fmt.Sprintf("%s- %s\n", indentStr, node.Label))
	if node.ImageB64 != "" {
		sb.WriteString(fmt.Sprintf("%s  ![image](%s)\n", indentStr, node.ImageB64))
	}
	for _, child := range node.Children {
		exportListNode(sb, child, indent+1)
	}
}
