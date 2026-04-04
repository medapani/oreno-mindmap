import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMindMapStore } from '../store/mindmapStore';

export const SheetTabs: React.FC = () => {
  const { sheets, activeSheetId, switchSheet, addSheet, duplicateSheet, deleteSheet, renameSheet, moveSheetLeft, moveSheetRight, reorderSheet } = useMindMapStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sheetId: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ドラッグ状態
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; side: 'left' | 'right' } | null>(null);

  // コンテキストメニューの外クリックで閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  // インライン編集モード開始
  const startEdit = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
    setContextMenu(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, []);

  // インライン編集確定
  const commitEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameSheet(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, renameSheet]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') {
        setEditingId(null);
        setEditValue('');
      }
    },
    [commitEdit]
  );

  const handleTabContextMenu = useCallback((e: React.MouseEvent, sheetId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sheetId });
  }, []);

  // ── ドラッグ＆ドロップハンドラー ──────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, sheetId: string) => {
    setDraggingId(sheetId);
    e.dataTransfer.effectAllowed = 'move';
    // Firefoxではデータセットが必要
    e.dataTransfer.setData('text/plain', sheetId);
  }, []);

  const getSide = (e: React.DragEvent): 'left' | 'right' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
  };

  const handleDragOver = useCallback((e: React.DragEvent, sheetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const side = getSide(e);
    setDropInfo(prev =>
      prev?.id === sheetId && prev?.side === side ? prev : { id: sheetId, side }
    );
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSheetId: string) => {
    e.preventDefault();
    const fromId = draggingId;
    if (!fromId || fromId === targetSheetId) {
      setDropInfo(null);
      return;
    }
    const side = getSide(e);
    if (side === 'left') {
      reorderSheet(fromId, targetSheetId);
    } else {
      const targetIdx = sheets.findIndex(s => s.id === targetSheetId);
      const nextSheet = sheets[targetIdx + 1];
      reorderSheet(fromId, nextSheet?.id ?? null);
    }
    setDropInfo(null);
  }, [draggingId, sheets, reorderSheet]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropInfo(null);
  }, []);
  // ─────────────────────────────────────────────────────────

  const contextSheetIndex = contextMenu ? sheets.findIndex(s => s.id === contextMenu.sheetId) : -1;
  const canMoveLeft = contextSheetIndex > 0;
  const canMoveRight = contextSheetIndex !== -1 && contextSheetIndex < sheets.length - 1;

  return (
    <div className="relative flex items-stretch h-9 bg-slate-100 border-t border-slate-200 select-none overflow-x-auto">
      {/* シートタブ */}
      <div className="flex items-stretch min-w-0">
        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = editingId === sheet.id;
          const isDragging = draggingId === sheet.id;
          const showLeft = dropInfo?.id === sheet.id && dropInfo.side === 'left' && draggingId !== sheet.id;
          const showRight = dropInfo?.id === sheet.id && dropInfo.side === 'right' && draggingId !== sheet.id;

          return (
            <div
              key={sheet.id}
              draggable={!isEditing}
              onDragStart={e => handleDragStart(e, sheet.id)}
              onDragOver={e => handleDragOver(e, sheet.id)}
              onDrop={e => handleDrop(e, sheet.id)}
              onDragEnd={handleDragEnd}
              className={`
                relative flex items-center px-3 gap-1 text-xs border-r border-slate-200 shrink-0 min-w-[80px] max-w-[160px]
                ${isEditing ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'}
                ${isDragging ? 'opacity-40' : ''}
                ${isActive
                  ? 'bg-white text-slate-800 font-medium border-t-2 border-t-blue-500 -mt-px'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
              `}
              onClick={() => !isEditing && !draggingId && switchSheet(sheet.id)}
              onDoubleClick={() => startEdit(sheet.id, sheet.name)}
              onContextMenu={e => handleTabContextMenu(e, sheet.id)}
              title={sheet.name}
            >
              {/* 左ドロップインジケーター */}
              {showLeft && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full z-10" />
              )}
              {/* 右ドロップインジケーター */}
              {showRight && (
                <span className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full z-10" />
              )}

              {isEditing ? (
                <input
                  ref={inputRef}
                  className="w-full bg-transparent outline-none text-xs text-slate-800 min-w-0"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{sheet.name}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* シート追加ボタン */}
      <button
        className="flex items-center justify-center w-9 shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors text-base font-light"
        onClick={addSheet}
        title="シートを追加"
      >
        +
      </button>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-xs text-slate-700 min-w-[140px]"
          style={{ left: contextMenu.x, bottom: window.innerHeight - contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
            onClick={() => {
              const sheet = sheets.find(s => s.id === contextMenu.sheetId);
              if (sheet) startEdit(sheet.id, sheet.name);
            }}
          >
            ✏️ 名前を変更
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
            onClick={() => {
              duplicateSheet(contextMenu.sheetId);
              setContextMenu(null);
            }}
          >
            📋 シートを複製
          </button>
          {canMoveLeft && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
              onClick={() => {
                moveSheetLeft(contextMenu.sheetId);
                setContextMenu(null);
              }}
            >
              ◀️ 左へ移動
            </button>
          )}
          {canMoveRight && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
              onClick={() => {
                moveSheetRight(contextMenu.sheetId);
                setContextMenu(null);
              }}
            >
              ▶️ 右へ移動
            </button>
          )}
          {sheets.length > 1 && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
              onClick={() => {
                deleteSheet(contextMenu.sheetId);
                setContextMenu(null);
              }}
            >
              🗑️ シートを削除
            </button>
          )}
        </div>
      )}
    </div>
  );
};
