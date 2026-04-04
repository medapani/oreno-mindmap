import React, { useEffect, useRef, useState } from 'react';
import { useMindMapStore } from '../store/mindmapStore';
import { ColorPicker } from './ColorPicker';
import { wailsClient } from '../api/wailsClient';

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, nodeId, onClose }) => {
  const store = useMindMapStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const selectedNode = store.nodes.find(n => n.id === nodeId);
  const currentColor = (selectedNode?.data as { color: string })?.color ?? '#94A3B8';
  const isRoot = (selectedNode?.data as { isRoot?: boolean })?.isRoot;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handle = (fn: () => void) => {
    fn();
    onClose();
  };

  const handleAddImage = async () => {
    onClose();
    try {
      const b64 = await wailsClient.loadImageFile();
      if (b64) store.updateNodeImage(nodeId, b64);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveImage = () => {
    handle(() => store.updateNodeImage(nodeId, ''));
  };

  const hasImage = !!(selectedNode?.data as { image?: string })?.image;

  // 兄弟内での位置を判定（上/下移動の有効化判定）
  const parentEdge = store.edges.find(e => e.target === nodeId);
  const siblings = parentEdge
    ? store.edges.filter(e => e.source === parentEdge.source).map(e => e.target)
    : [];
  const siblingIdx = siblings.indexOf(nodeId);
  const canMoveUp = !isRoot && siblingIdx > 0;
  const canMoveDown = !isRoot && siblingIdx !== -1 && siblingIdx < siblings.length - 1;

  const clipboard = store.clipboard;
  const canPaste = !!clipboard;

  const selectedNodeIds = store.selectedNodeIds;
  const isMultiSelected = selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-44"
      style={{ left: x, top: y }}
    >
      {/* ルートノードは左右を選択可能、非ルートは親と同じ方向に追加 */}
      {isRoot ? (
        <>
          <MenuItem icon="➡️" label="右に子ノードを追加" shortcut="Tab" onClick={() => handle(() => store.addChildNode(nodeId, 'right'))} />
          <MenuItem icon="⬅️" label="左に子ノードを追加" shortcut="⇧Tab" onClick={() => handle(() => store.addChildNodeLeft(nodeId))} />
        </>
      ) : (
        <MenuItem icon="➕" label="子ノードを追加" shortcut="Tab" onClick={() => handle(() => store.addChildNode(nodeId))} />
      )}
      {!isRoot && <MenuItem icon="↔" label="兄弟ノードを追加" shortcut="Enter" onClick={() => handle(() => store.addSiblingNode(nodeId))} />}

      {/* 順序入れ替え */}
      {(canMoveUp || canMoveDown) && <div className="h-px bg-slate-100 my-1" />}
      {canMoveUp && (
        <MenuItem icon="⬆️" label="上に移動" shortcut="⌥↑" onClick={() => handle(() => store.moveNodeUp(nodeId))} />
      )}
      {canMoveDown && (
        <MenuItem icon="⬇️" label="下に移動" shortcut="⌥↓" onClick={() => handle(() => store.moveNodeDown(nodeId))} />
      )}

      <div className="h-px bg-slate-100 my-1" />

      {/* コピー＆ペースト */}
      <MenuItem icon="📋" label="コピー" shortcut="⌘C" onClick={() => handle(() => store.copyNode(nodeId))} />
      {canPaste && !clipboard!.isRoot && (
        <MenuItem
          icon="📌"
          label="ここにペースト"
          shortcut="⌘V"
          onClick={() => handle(() => store.pasteNode(nodeId))}
        />
      )}

      <div className="h-px bg-slate-100 my-1" />

      {/* カラー変更 */}
      <div className="relative">
        <MenuItem
          icon="🎨"
          label="色を変更"
          onClick={() => setShowColorPicker(v => !v)}
        />
        {showColorPicker && (
          <div className="absolute left-full top-0 ml-1">
            <ColorPicker
              currentColor={currentColor}
              onSelect={(color) => { store.updateNodeColor(nodeId, color); onClose(); }}
              onClose={() => setShowColorPicker(false)}
            />
          </div>
        )}
      </div>

      {/* 画像操作 */}
      <MenuItem icon="🖼" label="画像を追加..." onClick={handleAddImage} />
      {hasImage && <MenuItem icon="🗑" label="画像を削除" onClick={handleRemoveImage} />}

      <div className="h-px bg-slate-100 my-1" />
      {isMultiSelected && (
        <MenuItem
          icon="🗑"
          label={`${selectedNodeIds.length}個のノードを削除`}
          onClick={() => handle(() => store.deleteSelectedNodes())}
          danger
        />
      )}
      <MenuItem
        icon="🗑"
        label={isRoot ? 'ツリーを削除' : '削除'}
        shortcut="Del"
        onClick={() => handle(() => store.deleteNode(nodeId))}
        danger
      />
    </div>
  );
};

interface MenuItemProps {
  icon: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, shortcut, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${danger
      ? 'text-red-600 hover:bg-red-50'
      : 'text-slate-700 hover:bg-slate-50'
      }`}
  >
    <span className="text-base">{icon}</span>
    <span className="flex-1">{label}</span>
    {shortcut && <span className="text-xs text-slate-400">{shortcut}</span>}
  </button>
);
