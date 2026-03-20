import { useEffect } from 'react';
import { useMindMapStore } from '../store/mindmapStore';

export function useKeyboard() {
  const store = useMindMapStore();

  useEffect(() => {
    // IME (日本語入力) の状態を追跡する
    // compositionend 後に発生する「幽霊 Enter」を防ぐためのフラグ
    let isComposing = false;
    let ignoreNextEnter = false;

    const handleCompositionStart = () => { isComposing = true; };
    const handleCompositionEnd = () => {
      isComposing = false;
      // compositionend の直後に phantom Enter が発火する場合があるため、
      // 次の Enter を1回だけ無視するフラグを立てる
      ignoreNextEnter = true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target as HTMLElement;
      const isEditing = target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // IME確定直後の phantom Enter を無視（フラグは即リセット）
      if (e.key === 'Enter') {
        const shouldIgnore = ignoreNextEnter;
        ignoreNextEnter = false;
        if (shouldIgnore) return;
      }

      // 編集中は一部ショートカットを無効化
      if (!isEditing) {
        // Tab: 子ノード追加 / Shift+Tab: ルートなら左側に追加、それ以外は親方向に追加
        if (e.key === 'Tab' && store.selectedNodeId) {
          e.preventDefault();
          const selectedNode = store.nodes.find(n => n.id === store.selectedNodeId);
          const isSelectedRoot = (selectedNode?.data as { isRoot?: boolean })?.isRoot;
          if (e.shiftKey && isSelectedRoot) {
            store.addChildNodeLeft(store.selectedNodeId);
          } else {
            store.addChildNode(store.selectedNodeId);
          }
          return;
        }

        // Enter: 兄弟ノード追加（ルートノード以外）
        if (e.key === 'Enter' && store.selectedNodeId && !e.shiftKey && !isComposing) {
          e.preventDefault();
          store.addSiblingNode(store.selectedNodeId);
          return;
        }

        // Delete/Backspace: ノード削除
        if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedNodeId) {
          e.preventDefault();
          store.deleteNode(store.selectedNodeId);
          return;
        }

        // Alt+↑: 兄弟内で上に移動 / Alt+↓: 下に移動
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && store.selectedNodeId) {
          e.preventDefault();
          if (e.key === 'ArrowUp') {
            store.moveNodeUp(store.selectedNodeId);
          } else {
            store.moveNodeDown(store.selectedNodeId);
          }
          return;
        }

        // Ctrl+C / Cmd+C: ノードコピー
        if (cmdOrCtrl && e.key === 'c' && store.selectedNodeId) {
          e.preventDefault();
          store.copyNode(store.selectedNodeId);
          return;
        }
      }

      // Ctrl+Z / Cmd+Z: Undo
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      // Ctrl+Y / Cmd+Shift+Z: Redo
      if (cmdOrCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        store.redo();
        return;
      }

      // Ctrl+S / Cmd+S: 保存
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        store.saveFile();
        return;
      }

      // Ctrl+V / Cmd+V（編集中でない場合）: 画像ペースト優先、なければノードペースト
      if (cmdOrCtrl && e.key === 'v' && !isEditing) {
        e.preventDefault();
        if (store.selectedNodeId) {
          // ノードが選択中の場合はまずクリップボード画像を試みる
          import('../api/wailsClient').then(({ wailsClient }) => {
            wailsClient.getClipboardImage().then(b64 => {
              if (b64 && store.selectedNodeId) {
                // 画像があれば貼り付け
                store.updateNodeImage(store.selectedNodeId, b64);
              } else if (store.clipboard) {
                // 画像がなければノードペースト
                store.pasteNode();
              }
            }).catch(() => {
              // 画像取得失敗時はノードペーストにフォールバック
              if (store.clipboard) {
                store.pasteNode();
              }
            });
          });
        } else if (store.clipboard) {
          // ノード未選択かつクリップボードにノードがある場合はペースト
          store.pasteNode();
        }
        return;
      }
    };

    window.addEventListener('compositionstart', handleCompositionStart);
    window.addEventListener('compositionend', handleCompositionEnd);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('compositionstart', handleCompositionStart);
      window.removeEventListener('compositionend', handleCompositionEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [store]);
}
