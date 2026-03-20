//go:build !darwin

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

// getMacOptions はmacOS以外ではnilを返す（Mac固有オプション不要）
func getMacOptions(_ *App) *mac.Options {
	return nil
}
