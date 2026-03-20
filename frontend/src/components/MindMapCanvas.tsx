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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMindMapStore } from '../store/mindmapStore';
import { MindMapNode } from './MindMapNode';
import { ContextMenu } from './ContextMenu';

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
  } = useMindMapStore();

  const { fitView, getIntersectingNodes, screenToFlowPosition, setCenter, getNode } = useReactFlow();

  const onMouseMoveOnPane = useCallback((e: React.MouseEvent) => {
    setMouseFlowPosition(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [screenToFlowPosition, setMouseFlowPosition]);

  // ドラッグ中ノードIDを追跡する
  const draggingNodeIdRef = useRef<string | null>(null);

  // ルートへの付け替え時に左右選択ダイアログ用
  const [pendingReparent, setPendingReparent] = useState<{ nodeId: string; newParentId: string } | null>(null);

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
    setContextMenu(null);
    setPaneMenu(null);
  }, [setSelectedNodeId, setContextMenu]);

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: RFNode) => {
      e.preventDefault();
      setSelectedNodeId(node.id);
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    [setSelectedNodeId, setContextMenu]
  );

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      setContextMenu(null);
      const clientX = (e as MouseEvent).clientX;
      const clientY = (e as MouseEvent).clientY;
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      setPaneMenu({ x: clientX, y: clientY, flowPosition });
    },
    [setContextMenu, screenToFlowPosition]
  );

  // ドラッグ開始時: ノードIDを記録
  const onNodeDragStart = useCallback((_: React.MouseEvent, node: RFNode) => {
    draggingNodeIdRef.current = node.id;
  }, []);

  // ドラッグ中: ルートノード以外はドロップターゲットを検出してハイライト
  const onNodeDrag = useCallback((_: React.MouseEvent, node: RFNode) => {
    if (trees.length === 0) return;
    // ルートノードをドラッグ中は付け替え不要
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
  const onNodeDragStop = useCallback((_: React.MouseEvent, node: RFNode) => {
    const { dropTargetId } = useMindMapStore.getState();
    const draggingId = draggingNodeIdRef.current;
    const isDraggingRoot = draggingId ? trees.some(t => t.id === draggingId) : false;

    if (!isDraggingRoot && dropTargetId && draggingId && draggingId !== dropTargetId) {
      if (trees.some(t => t.id === dropTargetId)) {
        // ルートへの付け替え: 左右選択ダイアログを表示
        setPendingReparent({ nodeId: draggingId, newParentId: dropTargetId });
        setDropTargetId(null);
      } else {
        reparentNode(draggingId, dropTargetId);
      }
    } else if (draggingId && !isDraggingRoot) {
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
  }, [reparentNode, setDropTargetId, trees]);

  return (
    <div className="flex-1 relative bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onMouseMove={onMouseMoveOnPane}
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
                  reparentNode(pendingReparent.nodeId, pendingReparent.newParentId, 'left');
                  setPendingReparent(null);
                }}
              >
                ⬅️ 左
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 font-medium transition-colors"
                onClick={() => {
                  reparentNode(pendingReparent.nodeId, pendingReparent.newParentId, 'right');
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
