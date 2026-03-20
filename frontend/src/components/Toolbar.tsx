import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMindMapStore } from '../store/mindmapStore';

interface ToolbarProps {
  onNew: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onNew }) => {
  const { isDirty, currentFilePath, saveFile, saveAsFile, openFile, exportMarkdown, importSheets, undo, redo, history, historyIndex, autoLayout, autoSave, toggleAutoSave, searchQuery, searchMatchIds, searchCurrentIndex, setSearchQuery, navigateSearchNext, navigateSearchPrev, clearSearch } = useMindMapStore();

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fileName = currentFilePath
    ? currentFilePath.split('/').pop()
    : '新規マインドマップ';

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Cmd+F で検索バーにフォーカス
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target as HTMLElement;
      if (target.isContentEditable) return;
      if (cmdOrCtrl && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navigateSearchPrev();
      else navigateSearchNext();
    }
    if (e.key === 'Escape') {
      clearSearch();
      searchInputRef.current?.blur();
    }
  }, [navigateSearchNext, navigateSearchPrev, clearSearch]);

  return (
    <header className="flex items-center gap-2 px-4 h-12 bg-white border-b border-slate-200 select-none drag-region">
      {/* アプリ名 */}
      <span className="text-slate-800 font-bold text-sm mr-2 no-drag">💡 Oreno MindMap</span>

      {/* ファイル操作ボタン群 */}
      <div className="flex items-center gap-1 no-drag">
        <FileMenu onNew={onNew} onOpen={openFile} onSaveAs={saveAsFile} isDirty={isDirty} />
        <ToolBtn label={isDirty ? '保存*' : '保存'} onClick={saveFile} primary={isDirty} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <AutoSaveToggle enabled={autoSave} onToggle={toggleAutoSave} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn label="MDエクスポート" onClick={exportMarkdown} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn label="インポート" onClick={importSheets} />
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 no-drag">
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn label="↩ Undo" onClick={undo} disabled={!canUndo} />
        <ToolBtn label="↪ Redo" onClick={redo} disabled={!canRedo} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn label="⟳ 整列" onClick={autoLayout} />
      </div>

      {/* ファイル名 */}
      <div className="flex-1 text-center text-xs text-slate-400 no-drag pointer-events-none">
        {fileName}{isDirty ? ' *' : ''}
      </div>

      {/* 検索バー */}
      <div className="flex items-center gap-1 no-drag">
        <div className="relative flex items-center">
          <span className="absolute left-2 text-slate-400 text-xs pointer-events-none">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="検索... (⌘F)"
            className="pl-7 pr-2 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-blue-400 w-48"
          />
        </div>
        {searchQuery && (
          <>
            <span className={`text-xs min-w-[3rem] text-center ${searchMatchIds.length === 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {searchMatchIds.length > 0 ? `${searchCurrentIndex + 1}/${searchMatchIds.length}` : '0件'}
            </span>
            <ToolBtn label="↑" onClick={navigateSearchPrev} disabled={searchMatchIds.length === 0} />
            <ToolBtn label="↓" onClick={navigateSearchNext} disabled={searchMatchIds.length === 0} />
            <ToolBtn label="✕" onClick={clearSearch} />
          </>
        )}
      </div>
    </header>
  );
};

interface ToolBtnProps {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

const ToolBtn: React.FC<ToolBtnProps> = ({ label, onClick, primary, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${disabled
      ? 'text-slate-300 cursor-not-allowed'
      : primary
        ? 'bg-blue-500 text-white hover:bg-blue-600'
        : 'text-slate-600 hover:bg-slate-100'
      }`}
  >
    {label}
  </button>
);

interface AutoSaveToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

const AutoSaveToggle: React.FC<AutoSaveToggleProps> = ({ enabled, onToggle }) => (
  <button
    onClick={onToggle}
    title={enabled ? '自動保存: ON（クリックで無効化）' : '自動保存: OFF（クリックで有効化）'}
    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${enabled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'text-slate-400 hover:bg-slate-100'
      }`}
  >
    {enabled ? '⏺ 自動保存 ON' : '⏺ 自動保存 OFF'}
  </button>
);

interface FileMenuProps {
  onNew: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  isDirty: boolean;
}

const FileMenu: React.FC<FileMenuProps> = ({ onNew, onOpen, onSaveAs, isDirty }) => {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handle = (fn: () => void) => () => { fn(); setOpen(false); };

  const handleNew = () => {
    setOpen(false);
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onNew();
    }
  };

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1"
        >
          ファイル <span className="text-slate-400">▾</span>
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
            <MenuItem label="新規" onClick={handleNew} />
            <MenuItem label="開く" onClick={handle(onOpen)} />
            <div className="my-1 border-t border-slate-100" />
            <MenuItem label="名前をつけて保存" onClick={handle(onSaveAs)} />
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-72 flex flex-col gap-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              編集中の内容は破棄されます。<br />新規作成してよろしいですか？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => { setConfirmOpen(false); onNew(); }}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                破棄して新規作成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const MenuItem: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
  >
    {label}
  </button>
);
