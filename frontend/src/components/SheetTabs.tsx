import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMindMapStore } from '../store/mindmapStore';

export const SheetTabs: React.FC = () => {
  const { sheets, activeSheetId, switchSheet, addSheet, duplicateSheet, deleteSheet, renameSheet } = useMindMapStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sheetId: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative flex items-stretch h-9 bg-slate-100 border-t border-slate-200 select-none overflow-x-auto">
      {/* シートタブ */}
      <div className="flex items-stretch min-w-0">
        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = editingId === sheet.id;

          return (
            <div
              key={sheet.id}
              className={`
                relative flex items-center px-3 gap-1 text-xs cursor-pointer border-r border-slate-200 shrink-0 min-w-[80px] max-w-[160px]
                ${isActive
                  ? 'bg-white text-slate-800 font-medium border-t-2 border-t-blue-500 -mt-px'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
              `}
              onClick={() => !isEditing && switchSheet(sheet.id)}
              onDoubleClick={() => startEdit(sheet.id, sheet.name)}
              onContextMenu={e => handleTabContextMenu(e, sheet.id)}
              title={sheet.name}
            >
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
