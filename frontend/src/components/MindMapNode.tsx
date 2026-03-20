import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { useMindMapStore } from '../store/mindmapStore';

interface MindMapNodeData {
  label: string;
  color: string;
  image?: string;
  collapsed?: boolean;
  isRoot?: boolean;
  direction?: 'right' | 'left';
  hasChildren?: boolean;
  nodeWidth?: number;
}

const MindMapNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as MindMapNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const isEditingRef = useRef(false); // Reactの再レンダリングに依存しない編集状態
  const { updateNodeLabel, toggleCollapse, dropTargetId, searchMatchIds, searchCurrentIndex, updateNodeSize } = useMindMapStore();

  // ESCでプレビューを閉じる
  useEffect(() => {
    if (!imagePreview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [imagePreview]);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreview(true);
  }, []);

  const isDropTarget = dropTargetId === id;
  const isSearchMatch = searchMatchIds.includes(id);
  const isCurrentSearchMatch = searchMatchIds[searchCurrentIndex] === id;

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    isEditingRef.current = true;
    setIsEditing(true);
    setTimeout(() => {
      if (labelRef.current) {
        labelRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(labelRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }, 0);
  }, []);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    setIsEditing(false);
    if (labelRef.current) {
      updateNodeLabel(id, labelRef.current.innerText.trim() || 'ノード');
    }
  }, [id, updateNodeLabel]);

  const handleCompositionStart = useCallback(() => { isComposingRef.current = true; }, []);
  const handleCompositionEnd = useCallback(() => { isComposingRef.current = false; }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isEditingRef.current) {
        // 編集中はwindowのグローバルハンドラに伝播させない
        // (WKWebViewではisComposingが正しく設定されないため、stopPropagationで確実に止める)
        e.stopPropagation();
        if (!isComposingRef.current) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }
    }
    if (e.key === 'Escape') {
      if (isEditingRef.current) {
        e.stopPropagation();
        isEditingRef.current = false;
        setIsEditing(false);
        if (labelRef.current) labelRef.current.innerText = nodeData.label;
        (e.target as HTMLElement).blur();
      }
    }
  }, [nodeData.label]);

  const borderColor = isDropTarget
    ? '#22c55e'
    : selected
      ? '#1d4ed8'
      : 'transparent';
  const shadowClass = isCurrentSearchMatch
    ? 'shadow-lg ring-4 ring-yellow-400'
    : isSearchMatch
      ? 'shadow-md ring-2 ring-yellow-300 ring-opacity-70'
      : isDropTarget
        ? 'shadow-xl ring-4 ring-green-400 ring-opacity-70'
        : selected
          ? 'shadow-lg ring-2 ring-blue-500'
          : 'shadow-md hover:shadow-lg';

  const isLeft = nodeData.direction === 'left';

  // ハンドルのスタイル
  const handleClass = '!w-2 !h-2 !bg-white !border-2 !border-slate-400';

  return (
    <div
      className={`relative rounded-xl transition-all duration-150 select-none ${shadowClass}`}
      style={{
        backgroundColor: nodeData.color,
        border: `2px solid ${borderColor}`,
        minWidth: 100,
        width: '100%',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={100}
        minHeight={40}
        lineStyle={{ borderColor: '#1d4ed8', borderWidth: 2 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff', border: '2px solid #1d4ed8' }}
        onResizeEnd={(_, params) => updateNodeSize(id, params.width)}
      />
      {/* ドロップターゲット時のバッジ */}
      {isDropTarget && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow z-20 whitespace-nowrap">
          ここに付け替える
        </div>
      )}
      {/* ルート: 両側に source ハンドル */}
      {nodeData.isRoot && (
        <>
          <Handle id="source-right" type="source" position={Position.Right} className={handleClass} />
          <Handle id="source-left" type="source" position={Position.Left} className={handleClass} />
        </>
      )}

      {/* 右方向ノード: 左に target、右に source */}
      {!nodeData.isRoot && !isLeft && (
        <>
          <Handle id="target-left" type="target" position={Position.Left} className={handleClass} />
          <Handle id="source-right" type="source" position={Position.Right} className={handleClass} />
        </>
      )}

      {/* 左方向ノード: 右に target、左に source */}
      {!nodeData.isRoot && isLeft && (
        <>
          <Handle id="target-right" type="target" position={Position.Right} className={handleClass} />
          <Handle id="source-left" type="source" position={Position.Left} className={handleClass} />
        </>
      )}

      <div className="p-3">
        {/* 画像サムネイル */}
        {nodeData.image && (
          <img
            src={nodeData.image}
            alt="node"
            className="w-full rounded-lg mb-2 object-contain max-h-72 cursor-zoom-in hover:opacity-90 transition-opacity"
            draggable={false}
            onClick={handleImageClick}
          />
        )}

        {/* ラベル */}
        <div
          ref={labelRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className={`text-sm font-semibold text-white text-center leading-tight break-words whitespace-pre-wrap outline-none ${isEditing ? 'bg-white bg-opacity-20 rounded px-1' : ''
            }`}
          style={{ minHeight: '1.2em', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {nodeData.label}
        </div>
      </div>

      {/* 折り畳みボタン: 左方向ノードは左側、それ以外は右側 */}
      {nodeData.hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
          className={`absolute ${isLeft ? '-left-3' : '-right-3'} top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 text-xs flex items-center justify-center hover:bg-slate-100 transition-colors z-10 nodrag`}
          style={{ cursor: 'pointer' }}
          title={nodeData.collapsed ? '展開' : '折り畳む'}
        >
          {nodeData.collapsed ? '+' : '−'}
        </button>
      )}

      {/* 画像ライトボックス */}
      {imagePreview && nodeData.image && (
        <Lightbox src={nodeData.image} onClose={() => setImagePreview(false)} />
      )}
    </div>
  );
};

export const MindMapNode = memo(MindMapNodeComponent);

// ─── Image Lightbox (portal) ─────────────────────────────────────────────────

interface LightboxProps {
  src: string;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ src, onClose }) => {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-80"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt="プレビュー"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
          draggable={false}
        />
        <button
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-700 text-sm font-bold shadow-lg hover:bg-slate-100 transition-colors flex items-center justify-center"
          onClick={onClose}
          title="閉じる"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  );
};
