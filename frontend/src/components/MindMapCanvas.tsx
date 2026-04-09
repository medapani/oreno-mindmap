import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  BackgroundVariant,
  Node as RFNode,
  useReactFlow,
  OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMindMapStore } from '../store/mindmapStore';
import { MindMapNode } from './MindMapNode';
import { ContextMenu } from './ContextMenu';
import { ColorPicker } from './ColorPicker';

const nodeTypes: NodeTypes = {
  mindmapNode: MindMapNode,
};

// 起動直後のズーム上限 (小さくするほど引いた状態で表示される)
const INITIAL_ZOOM = 1.0;

export const MindMapCanvas: React.FC = () => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setSelectedNodeId,
    selectedNodeId,
    contextMenu,
    setContextMenu,
    fitViewTrigger,
    setDropTargetId,
    reparentNode,
    trees,
    addRootNode,
    setMouseFlowPosition,
    clipboard,
    pasteNode,
    focusNodeId,
    focusNodeTrigger,
    selectedNodeIds,
    setSelectedNodeIds,
    updateSelectedNodesColor,
    updateSelectedNodesTextAlign,
    reparentMultipleNodes,
  } = useMindMapStore();

  const { fitView, getIntersectingNodes, screenToFlowPosition, setCenter, getNode } = useReactFlow();

  // screenToFlowPosition は viewport 変化のたびに変わるので ref 経由でネイティブリスナーに渡す
  const screenToFlowPositionRef = useRef(screenToFlowPosition);
  useEffect(() => { screenToFlowPositionRef.current = screenToFlowPosition; }, [screenToFlowPosition]);

  // コンテナ ref（ネイティブ contextmenu リスナー用）
  const flowContainerRef = useRef<HTMLDivElement>(null);

  const onMouseMoveOnPane = useCallback((e: React.MouseEvent) => {
    setMouseFlowPosition(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [screenToFlowPosition, setMouseFlowPosition]);

  // ドラッグ中ノードIDを追跡する
  const draggingNodeIdRef = useRef<string | null>(null);

  // ルートへの付け替え時に左右選択ダイアログ用
  const [pendingReparent, setPendingReparent] = useState<{ nodeIds: string[]; newParentId: string } | null>(null);

  // 複数選択時のカラーピッカー表示
  const [showMultiColorPicker, setShowMultiColorPicker] = useState(false);

  const getMultiAlignButtonClass = (textAlign: 'left' | 'center' | 'right') => {
    const allSelectedMatch = selectedNodeIds.length > 0 && selectedNodeIds.every(id => {
      const node = nodes.find(n => n.id === id);
      return ((node?.data as { textAlign?: 'left' | 'center' | 'right' })?.textAlign ?? 'center') === textAlign;
    });
    return allSelectedMatch
      ? 'bg-slate-900 text-white'
      : 'text-slate-700 hover:bg-slate-100';
  };

  // Space キー保持中はパンモード
  const [isPanMode, setIsPanMode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      setIsPanMode(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsPanMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    setSelectedNodeIds(selectedNodes.map(n => n.id));
    if (selectedNodes.length !== selectedNodeIds.length) {
      setShowMultiColorPicker(false);
    }
  }, [setSelectedNodeIds, selectedNodeIds.length]);

  // ペイン右クリックメニュー
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number; flowPosition: { x: number; y: number } } | null>(null);
  const paneMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paneMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (paneMenuRef.current && !paneMenuRef.current.contains(e.target as Node)) {
        setPaneMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [paneMenu]);

  useEffect(() => {
    if (fitViewTrigger > 0) {
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    }
  }, [fitViewTrigger, fitView]);

  useEffect(() => {
    if (!focusNodeId || focusNodeTrigger === 0) return;
    setTimeout(() => {
      const rfNode = getNode(focusNodeId) as (RFNode & { measured?: { height?: number; width?: number } }) | undefined;
      if (!rfNode) return;
      const w = rfNode.measured?.width ?? 150;
      const h = rfNode.measured?.height ?? 50;
      setCenter(rfNode.position.x + w / 2, rfNode.position.y + h / 2, { zoom: 1.2, duration: 400 });
    }, 50);
  }, [focusNodeTrigger, focusNodeId, getNode, setCenter]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setContextMenu(null);
    setPaneMenu(null);
    setShowMultiColorPicker(false);
  }, [setSelectedNodeId, setSelectedNodeIds, setContextMenu]);

  // ネイティブ contextmenu リスナー：Shift+右クリック時も確実に発火させるため
  useEffect(() => {
    const container = flowContainerRef.current;
    if (!container) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const nodeEl = (e.target as Element).closest('.react-flow__node');
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-id');
        if (nodeId) {
          setSelectedNodeId(nodeId);
          setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
          setPaneMenu(null);
          return;
        }
      }
      // ドラッグ選択時は .react-flow__nodesselection オーバーレイが右クリックを受け取る
      // その場合は selectedNodeIds の先頭ノードをコンテキストメニューの対象にする
      const selectionEl = (e.target as Element).closest('.react-flow__nodesselection');
      if (selectionEl) {
        const { selectedNodeIds: selIds } = useMindMapStore.getState();
        if (selIds.length > 0) {
          setContextMenu({ x: e.clientX, y: e.clientY, nodeId: selIds[0] });
          setPaneMenu(null);
          return;
        }
      }
      setContextMenu(null);
      const flowPos = screenToFlowPositionRef.current({ x: e.clientX, y: e.clientY });
      setPaneMenu({ x: e.clientX, y: e.clientY, flowPosition: flowPos });
    };
    container.addEventListener('contextmenu', handler);
    return () => container.removeEventListener('contextmenu', handler);
  }, [setSelectedNodeId, setContextMenu]);

  // ドラッグ開始時: ノードIDを記録
  const onNodeDragStart = useCallback((_: React.MouseEvent, node: RFNode) => {
    draggingNodeIdRef.current = node.id;
  }, []);

  // ドラッグ中: ルートノード以外はドロップターゲットを検出してハイライト
  const onNodeDrag = useCallback((_: React.MouseEvent, node: RFNode, dragNodes: RFNode[]) => {
    if (trees.length === 0) return;
    // 複数ドラッグ中もドロップターゲット検出は主ノード基準で行う
    // 主ノードがルートなら付け替え不要
    if (trees.some(t => t.id === node.id)) return;

    // 自分自身の子孫IDセットを収集（循環防止）
    const descendantIds = new Set<string>();
    function collectDescendants(nodeId: string) {
      const rfNode = nodes.find(n => n.id === nodeId);
      if (!rfNode) return;
      descendantIds.add(nodeId);
      edges.filter(e => e.source === nodeId).forEach(e => collectDescendants(e.target));
    }
    collectDescendants(node.id);

    const intersecting = getIntersectingNodes(node).filter(
      n => n.id !== node.id && !descendantIds.has(n.id)
    );

    setDropTargetId(intersecting.length > 0 ? intersecting[0].id : null);
  }, [trees, nodes, edges, getIntersectingNodes, setDropTargetId]);

  // ドロップ時: 付け替えまたは兄弟並び替えを実行（ルートノードのドラッグ時は付け替えしない）
  const onNodeDragStop = useCallback((_: React.MouseEvent, node: RFNode, dragNodes: RFNode[]) => {
    const { dropTargetId } = useMindMapStore.getState();
    const draggingId = draggingNodeIdRef.current;
    const isDraggingRoot = draggingId ? trees.some(t => t.id === draggingId) : false;
    const isMultiDrag = dragNodes.length > 1;

    if (!isDraggingRoot && dropTargetId && draggingId && draggingId !== dropTargetId) {
      if (isMultiDrag) {
        // 複数ノード付け替え: 選択中の全非ルートノードを移動先にまとめて付け替え
        const { selectedNodeIds: selIds } = useMindMapStore.getState();
        const idsToMove = selIds.length > 0 ? selIds : [draggingId];
        if (trees.some(t => t.id === dropTargetId)) {
          // ルートへの付け替え: 左右選択ダイアログを表示
          setPendingReparent({ nodeIds: idsToMove, newParentId: dropTargetId });
          setDropTargetId(null);
        } else {
          reparentMultipleNodes(idsToMove, dropTargetId);
        }
      } else if (trees.some(t => t.id === dropTargetId)) {
        // ルートへの付け替え: 左右選択ダイアログを表示
        setPendingReparent({ nodeIds: [draggingId], newParentId: dropTargetId });
        setDropTargetId(null);
      } else {
        reparentNode(draggingId, dropTargetId);
      }
    } else if (draggingId && !isDraggingRoot && !isMultiDrag) {
      // 付け替えなし & ルートでない → 兄弟間並び替えチェック
      setDropTargetId(null);

      const { edges: currentEdges, nodes: currentNodes, reorderNodeAmongSiblings } = useMindMapStore.getState();
      const parentEdge = currentEdges.find(e => e.target === draggingId);
      if (parentEdge) {
        const draggingRFNode = currentNodes.find(n => n.id === draggingId);
        const draggingDir = (draggingRFNode?.data as { direction?: string })?.direction;
        const dragNodeHeight = (draggingRFNode as (RFNode & { measured?: { height?: number } }) | undefined)?.measured?.height ?? 40;
        const dragMidY = node.position.y + dragNodeHeight / 2;

        const otherSiblings = currentEdges
          .filter(e => e.source === parentEdge.source && e.target !== draggingId)
          .map(e => currentNodes.find(n => n.id === e.target))
          .filter((n): n is RFNode => n !== undefined)
          .filter(n => (n.data as { direction?: string })?.direction === draggingDir)
          .sort((a, b) => a.position.y - b.position.y);

        let insertBeforeId: string | null = null;
        for (const sibling of otherSiblings) {
          const sibHeight = (sibling as RFNode & { measured?: { height?: number } }).measured?.height ?? 40;
          const sibMidY = sibling.position.y + sibHeight / 2;
          if (dragMidY < sibMidY) {
            insertBeforeId = sibling.id;
            break;
          }
        }

        reorderNodeAmongSiblings(draggingId, insertBeforeId);
      }
    } else {
      setDropTargetId(null);
    }

    draggingNodeIdRef.current = null;
  }, [reparentNode, reparentMultipleNodes, setDropTargetId, trees]);

  return (
    <div ref={flowContainerRef} className={`flex-1 relative bg-slate-50${isPanMode ? ' cursor-grab' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onMouseMove={onMouseMoveOnPane}
        onSelectionChange={onSelectionChange}
        panOnDrag={isPanMode}
        selectionOnDrag={!isPanMode}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: INITIAL_ZOOM }}
        minZoom={0.1}
        maxZoom={3}
        nodeClickDistance={5}
        deleteKeyCode={null}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls className="!shadow-md !border-slate-200 !rounded-xl overflow-hidden" />
        <MiniMap
          className="!shadow-md !border-slate-200 !rounded-xl"
          nodeColor={(node) => (node.data as { color: string }).color}
          maskColor="rgba(248, 250, 252, 0.7)"
        />
      </ReactFlow>

      {/* 複数選択時の浮動カラー変更ツールバー */}
      {selectedNodeIds.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white rounded-xl shadow-xl border border-slate-200 px-4 py-2">
          <span className="text-xs text-slate-500 font-medium">{selectedNodeIds.length}個のノードを選択中</span>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSelectedNodesTextAlign('left')}
              className={`px-2.5 py-1.5 rounded-lg text-sm transition-colors ${getMultiAlignButtonClass('left')}`}
            >
              左
            </button>
            <button
              onClick={() => updateSelectedNodesTextAlign('center')}
              className={`px-2.5 py-1.5 rounded-lg text-sm transition-colors ${getMultiAlignButtonClass('center')}`}
            >
              中央
            </button>
            <button
              onClick={() => updateSelectedNodesTextAlign('right')}
              className={`px-2.5 py-1.5 rounded-lg text-sm transition-colors ${getMultiAlignButtonClass('right')}`}
            >
              右
            </button>
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <div className="relative">
            <button
              onClick={() => setShowMultiColorPicker(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span>🎨</span>
              <span>色を変更</span>
            </button>
            {showMultiColorPicker && (
              <div className="absolute top-full left-0 mt-1">
                <ColorPicker
                  currentColor=""
                  onSelect={(color) => {
                    updateSelectedNodesColor(color);
                    setShowMultiColorPicker(false);
                  }}
                  onClose={() => setShowMultiColorPicker(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ペイン右クリックメニュー */}
      {paneMenu && (
        <div
          ref={paneMenuRef}
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-48"
          style={{ left: paneMenu.x, top: paneMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => { addRootNode(paneMenu?.flowPosition); setPaneMenu(null); }}
          >
            <span>➕</span> 新しいルートノードを追加
          </button>
          {clipboard && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { pasteNode(undefined, true); setPaneMenu(null); }}
            >
              <span>🌱</span> ルートとしてペースト
            </button>
          )}
        </div>
      )}

      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ルートへの付け替え時の左右選択ダイアログ */}
      {pendingReparent && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-xl shadow-xl px-8 py-6 flex flex-col gap-5 items-center">
            <p className="text-slate-700 font-semibold text-base">ルートノードのどちら側に配置しますか？</p>
            <div className="flex gap-4">
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 font-medium transition-colors"
                onClick={() => {
                  reparentMultipleNodes(pendingReparent.nodeIds, pendingReparent.newParentId, 'left');
                  setPendingReparent(null);
                }}
              >
                ⬅️ 左
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 font-medium transition-colors"
                onClick={() => {
                  reparentMultipleNodes(pendingReparent.nodeIds, pendingReparent.newParentId, 'right');
                  setPendingReparent(null);
                }}
              >
                右 ➡️
              </button>
            </div>
            <button
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              onClick={() => setPendingReparent(null)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
