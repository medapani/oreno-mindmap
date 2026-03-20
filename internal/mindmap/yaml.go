package mindmap

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

const maxNodes = 1000

// Load は .orenomm (gzip圧縮YAML) ファイルからMindMapを読み込む
func Load(path string) (*MindMap, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("ファイル読み込み失敗: %w", err)
	}
	if len(data) < 2 || data[0] != 0x1f || data[1] != 0x8b {
		return nil, fmt.Errorf("不正なファイル形式です (.orenomm ファイルを指定してください)")
	}
	gr, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("gzip展開失敗: %w", err)
	}
	defer gr.Close()
	yamlData, err := io.ReadAll(gr)
	if err != nil {
		return nil, fmt.Errorf("gzip読み込み失敗: %w", err)
	}
	var mm MindMap
	if err := yaml.Unmarshal(yamlData, &mm); err != nil {
		return nil, fmt.Errorf("YAMLパース失敗: %w", err)
	}
	if len(mm.Sheets) == 0 {
		return nil, fmt.Errorf("不正なファイル形式です (シートが存在しません)")
	}
	return &mm, nil
}

// Save はMindMapをgzip圧縮YAMLファイル (.orenomm) に書き込む
func Save(mm *MindMap, path string) error {
	for _, s := range mm.Sheets {
		sheetNodes := 0
		for _, r := range s.Roots {
			sheetNodes += CountNodes(r)
		}
		if sheetNodes > maxNodes {
			return fmt.Errorf("シート「%s」のノード数が上限(%d)を超えています", s.Name, maxNodes)
		}
	}
	mm.UpdatedAt = time.Now().Format(time.RFC3339)
	yamlData, err := yaml.Marshal(mm)
	if err != nil {
		return fmt.Errorf("YAMLシリアライズ失敗: %w", err)
	}
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	if _, err := gw.Write(yamlData); err != nil {
		return fmt.Errorf("gzip圧縮失敗: %w", err)
	}
	if err := gw.Close(); err != nil {
		return fmt.Errorf("gzip終了失敗: %w", err)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0600); err != nil {
		return fmt.Errorf("ファイル書き込み失敗: %w", err)
	}
	return nil
}

// NewMindMap は新規マインドマップを作成する
func NewMindMap() *MindMap {
	defaultSheet := &Sheet{
		ID:   "sheet-1",
		Name: "Sheet 1",
		Roots: []*Node{
			{
				ID:    "root",
				Label: "テーマ",
				Color: "#60A5FA",
				X:     0,
				Y:     0,
			},
		},
	}
	return &MindMap{
		Version:       "2.0",
		CreatedAt:     time.Now().Format(time.RFC3339),
		UpdatedAt:     time.Now().Format(time.RFC3339),
		Sheets:        []*Sheet{defaultSheet},
		ActiveSheetID: defaultSheet.ID,
	}
}
