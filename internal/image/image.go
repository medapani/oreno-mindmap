package image

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"

	"golang.design/x/clipboard"
)

// LoadFromFile はファイルパスから画像をBase64エンコードして返す
func LoadFromFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("画像読み込み失敗: %w", err)
	}
	mimeType := http.DetectContentType(data)
	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}

// GetFromClipboard はクリップボードの画像をBase64エンコードして返す
func GetFromClipboard() (string, error) {
	if err := clipboard.Init(); err != nil {
		return "", fmt.Errorf("クリップボード初期化失敗: %w", err)
	}
	data := clipboard.Read(clipboard.FmtImage)
	if data == nil {
		return "", fmt.Errorf("クリップボードに画像がありません")
	}
	mimeType := http.DetectContentType(data)
	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}
