import React, { useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './components/Toolbar';
import { MindMapCanvas } from './components/MindMapCanvas';
import { SheetTabs } from './components/SheetTabs';
import { useMindMapStore } from './store/mindmapStore';
import { useKeyboard } from './hooks/useKeyboard';
import { wailsClient } from './api/wailsClient';
import { EventsOn } from '../wailsjs/runtime/runtime';

function AppInner() {
    const { newMindMap, loadMindMap, openFileByPath, saveError, clearSaveError } = useMindMapStore();
    useKeyboard();

    // 起動時の処理
    useEffect(() => {
        // 1. まず EventsOn を登録する（SetFrontendReady より先に必ず登録）
        const unsub = EventsOn('fileOpen', (filePath: string) => {
            // アプリ起動中にファイルをダブルクリックされたとき（Apple Event）
            openFileByPath(filePath).catch(console.error);
        });

        // 2. リスナー登録完了をGoに通知してから、起動時の保留ファイルを確認する
        wailsClient.setFrontendReady().then(() => {
            return wailsClient.getPendingFile();
        }).then(async (pendingPath) => {
            if (pendingPath) {
                await openFileByPath(pendingPath);
            } else {
                const mm = await wailsClient.newFile();
                if (mm) newMindMap(mm);
            }
        }).catch(() => {
            // Wailsバインディング未接続（開発中のフォールバック）
            newMindMap({
                version: '1.0',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sheets: [{ id: 'sheet-1', name: 'Sheet 1', roots: [{ id: 'root', label: 'テーマ', color: '#60A5FA', x: 0, y: 0 }] }],
                active_sheet_id: 'sheet-1',
            });
        });

        return () => unsub();
    }, []);

    const handleNew = useCallback(async () => {
        const mm = await wailsClient.newFile().catch(() => null);
        if (mm) newMindMap(mm);
    }, [newMindMap]);

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
            <Toolbar onNew={handleNew} />
            <MindMapCanvas />
            <SheetTabs />
            {saveError && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-red-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50 max-w-md">
                    <span>⚠️ 保存に失敗しました: {saveError}</span>
                    <button
                        onClick={clearSaveError}
                        className="ml-auto text-white/80 hover:text-white font-bold"
                        aria-label="閉じる"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}

function App() {
    return (
        <ReactFlowProvider>
            <AppInner />
        </ReactFlowProvider>
    );
}

export default App;
