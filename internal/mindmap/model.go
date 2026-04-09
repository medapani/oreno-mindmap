package mindmap

// Node はマインドマップの1ノードを表す
type Node struct {
	ID        string  `yaml:"id" json:"id"`
	Label     string  `yaml:"label" json:"label"`
	TextAlign string  `yaml:"textAlign,omitempty" json:"textAlign,omitempty"`
	Color     string  `yaml:"color" json:"color"`
	ImageB64  string  `yaml:"image,omitempty" json:"image,omitempty"`
	Children  []*Node `yaml:"children,omitempty" json:"children,omitempty"`
	X         float64 `yaml:"x" json:"x"`
	Y         float64 `yaml:"y" json:"y"`
	Collapsed bool    `yaml:"collapsed,omitempty" json:"collapsed,omitempty"`
	Direction string  `yaml:"direction,omitempty" json:"direction,omitempty"`
	Width     float64 `yaml:"width,omitempty" json:"width,omitempty"`
}

// Sheet は1枚のシート（Excelのシートに相当）を表す
type Sheet struct {
	ID    string  `yaml:"id" json:"id"`
	Name  string  `yaml:"name" json:"name"`
	Roots []*Node `yaml:"roots,omitempty" json:"roots,omitempty"`
}

// MindMap はファイル全体のデータ構造
type MindMap struct {
	Version       string   `yaml:"version" json:"version"`
	CreatedAt     string   `yaml:"created_at" json:"created_at"`
	UpdatedAt     string   `yaml:"updated_at" json:"updated_at"`
	Sheets        []*Sheet `yaml:"sheets,omitempty" json:"sheets,omitempty"`
	ActiveSheetID string   `yaml:"active_sheet_id,omitempty" json:"active_sheet_id,omitempty"`
}

// FindNode は ID でノードを再帰検索する
func FindNode(root *Node, id string) *Node {
	if root == nil {
		return nil
	}
	if root.ID == id {
		return root
	}
	for _, child := range root.Children {
		if found := FindNode(child, id); found != nil {
			return found
		}
	}
	return nil
}

// CountNodes はツリー全体のノード数を返す
func CountNodes(root *Node) int {
	if root == nil {
		return 0
	}
	count := 1
	for _, child := range root.Children {
		count += CountNodes(child)
	}
	return count
}
