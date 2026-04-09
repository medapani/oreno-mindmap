import { create } from 'zustand';
import {
  Node as RFNode,
  Edge as RFEdge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { MindMap, MindMapNode, Sheet } from '../types/mindmap';
import { treeToFlow, flowToTree, generateNodeId, computeLayout, computeMultiLayout, computeMultiLayoutWithSpacing, mergeTreesToFlow } from '../utils/treeUtils';
import { wailsClient } from '../api/wailsClient';

const MAX_HISTORY = 100;

interface HistoryEntry {
  nodes: RFNode[];
  edges: RFEdge[];
  trees: MindMapNode[];
}

interface MindMapStore {
  // React Flow状態
  nodes: RFNode[];
  edges: RFEdge[];

  // ツリーリスト（GoへシリアライズするためのSource of Truth）
  trees: MindMapNode[];

  // シート
  sheets: Sheet[];
  activeSheetId: string;

  // ファイル状態
  currentFilePath: string;
  isDirty: boolean;
  mindmapMeta: { version: string; created_at: string; updated_at: string } | null;

  // 選択中ノード
  selectedNodeId: string | null;

  // 複数選択中ノードID一覧
  selectedNodeIds: string[];

  // Undo/Redo
  history: HistoryEntry[];
  historyIndex: number;

  // fitView トリガー（increment で Canvas 側が fitView を実行）
  fitViewTrigger: number;

  // コンテキストメニュー
  contextMenu: { x: number; y: number; nodeId: string } | null;

  // コピー＆ペースト用クリップボード
  clipboard: { node: MindMapNode; isRoot: boolean } | null;

  // マウスカーソルのフロー座標（ペースト位置に使用）
  mouseFlowPosition: { x: number; y: number } | null;

  // ドラッグ中のドロップターゲット
  dropTargetId: string | null;

  // 自動保存
  autoSave: boolean;
  toggleAutoSave: () => void;

  // 自動編集対象ノードID
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;

  // 検索
  searchQuery: string;
  searchMatchIds: string[];
  searchCurrentIndex: number;
  focusNodeId: string | null;
  focusNodeTrigger: number;
  setSearchQuery: (query: string) => void;
  navigateSearchNext: () => void;
  navigateSearchPrev: () => void;
  clearSearch: () => void;

  // アクション
  loadMindMap: (mm: MindMap) => void;
  newMindMap: (mm: MindMap) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeTextAlign: (nodeId: string, textAlign: 'left' | 'center' | 'right') => void;
  updateNodeColor: (nodeId: string, color: string) => void;
  updateNodeImage: (nodeId: string, image: string) => void;
  updateNodeSize: (nodeId: string, width: number) => void;
  addChildNode: (parentId: string, direction?: 'right' | 'left') => void;
  addChildNodeLeft: (parentId: string) => void;
  addSiblingNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  deleteSelectedNodes: () => void;
  toggleCollapse: (nodeId: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  updateSelectedNodesColor: (color: string) => void;
  updateSelectedNodesTextAlign: (textAlign: 'left' | 'center' | 'right') => void;
  setContextMenu: (menu: { x: number; y: number; nodeId: string } | null) => void;
  setDropTargetId: (id: string | null) => void;
  setMouseFlowPosition: (pos: { x: number; y: number } | null) => void;
  reparentNode: (nodeId: string, newParentId: string, direction?: 'right' | 'left') => void;
  reparentMultipleNodes: (nodeIds: string[], newParentId: string, direction?: 'right' | 'left') => void;
  moveNodeUp: (nodeId: string) => void;
  moveNodeDown: (nodeId: string) => void;
  reorderNodeAmongSiblings: (nodeId: string, insertBeforeSiblingId: string | null) => void;
  addRootNode: (position?: { x: number; y: number }) => void;
  copyNode: (nodeId: string) => void;
  pasteNode: (targetNodeId?: string, asRoot?: boolean) => void;
  undo: () => void;
  redo: () => void;
  saveFile: () => Promise<void>;
  saveAsFile: () => Promise<void>;
  openFile: () => Promise<void>;
  openFileByPath: (path: string) => Promise<void>;
  exportMarkdown: () => Promise<void>;
  importSheets: () => Promise<void>;
  autoLayout: () => void;
  toMindMap: () => MindMap | null;
  pushHistory: () => void;
  _syncTree: () => void;
  // 追加直後でまだ実寻未計測のノードIDセット（実寻後に再レイアウトするため）
  pendingLayoutIds: Set<string>;
  saveError: string | null;
  clearSaveError: () => void;

  // シート操作
  switchSheet: (id: string) => void;
  addSheet: () => void;
  duplicateSheet: (id: string) => void;
  deleteSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;
  moveSheetLeft: (id: string) => void;
  moveSheetRight: (id: string) => void;
  reorderSheet: (fromId: string, insertBeforeId: string | null) => void;
}

// ─── 内部ヘルパー ────────────────────────────────────────────

/** React Flow の nodes から実測済み高さ・幅を収集する */
function buildNodeSizes(nodes: RFNode[]): { heights: Map<string, number>; widths: Map<string, number> } {
  const heights = new Map<string, number>();
  const widths = new Map<string, number>();
  for (const n of nodes) {
    const measured = (n as RFNode & { measured?: { height?: number; width?: number } }).measured;
    if (measured?.height) heights.set(n.id, measured.height);
    if (measured?.width) widths.set(n.id, measured.width);
  }
  return { heights, widths };
}

function findNodeInTree(tree: MindMapNode, id: string): MindMapNode | null {
  if (tree.id === id) return tree;
  for (const c of tree.children ?? []) {
    const found = findNodeInTree(c, id);
    if (found) return found;
  }
  return null;
}
function findTreeIndex(trees: MindMapNode[], id: string): number {
  return trees.findIndex(t => !!findNodeInTree(t, id));
}

function collectTreeNodeIds(roots: MindMapNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: MindMapNode) => {
    ids.push(node.id);
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  for (const root of roots) {
    walk(root);
  }
  return ids;
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  nodes: [],
  edges: [],
  trees: [],
  sheets: [],
  activeSheetId: '',
  currentFilePath: '',
  isDirty: false,
  mindmapMeta: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  history: [],
  historyIndex: -1,
  fitViewTrigger: 0,
  contextMenu: null,
  clipboard: null,
  mouseFlowPosition: null,
  dropTargetId: null,
  editingNodeId: null,
  autoSave: false,
  pendingLayoutIds: new Set<string>(),
  searchQuery: '',
  searchMatchIds: [],
  searchCurrentIndex: 0,
  focusNodeId: null,
  focusNodeTrigger: 0,

  setEditingNodeId: (id: string | null) => set({ editingNodeId: id }),

  setSelectedNodeIds: (ids: string[]) => set({ selectedNodeIds: ids }),

  updateSelectedNodesColor: (color: string) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        selectedNodeIds.includes(n.id) ? { ...n, data: { ...n.data, color } } : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  updateSelectedNodesTextAlign: (textAlign: 'left' | 'center' | 'right') => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        selectedNodeIds.includes(n.id) ? { ...n, data: { ...n.data, textAlign } } : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  setSearchQuery: (query: string) => {
    const { nodes } = get();
    if (!query.trim()) {
      set({ searchQuery: query, searchMatchIds: [], searchCurrentIndex: 0, focusNodeId: null });
      return;
    }
    const lower = query.toLowerCase();
    const matchIds = nodes
      .filter(n => {
        const label = ((n.data as Record<string, unknown>).label as string | undefined) ?? '';
        return label.toLowerCase().includes(lower);
      })
      .map(n => n.id);
    const firstId = matchIds.length > 0 ? matchIds[0] : null;
    set({
      searchQuery: query,
      searchMatchIds: matchIds,
      searchCurrentIndex: 0,
      focusNodeId: firstId,
      focusNodeTrigger: get().focusNodeTrigger + (firstId ? 1 : 0),
    });
  },

  navigateSearchNext: () => {
    const { searchMatchIds, searchCurrentIndex, focusNodeTrigger } = get();
    if (searchMatchIds.length === 0) return;
    const next = (searchCurrentIndex + 1) % searchMatchIds.length;
    set({ searchCurrentIndex: next, focusNodeId: searchMatchIds[next], focusNodeTrigger: focusNodeTrigger + 1 });
  },

  navigateSearchPrev: () => {
    const { searchMatchIds, searchCurrentIndex, focusNodeTrigger } = get();
    if (searchMatchIds.length === 0) return;
    const prev = (searchCurrentIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
    set({ searchCurrentIndex: prev, focusNodeId: searchMatchIds[prev], focusNodeTrigger: focusNodeTrigger + 1 });
  },

  clearSearch: () => set({ searchQuery: '', searchMatchIds: [], searchCurrentIndex: 0, focusNodeId: null }),

  toggleAutoSave: () => {
    const next = !get().autoSave;
    set({ autoSave: next });
  },

  loadMindMap: (mm: MindMap) => {
    const activeSheet = mm.sheets.find(s => s.id === mm.active_sheet_id) ?? mm.sheets[0];
    const { nodes, edges } = mergeTreesToFlow(activeSheet.roots);
    set({
      nodes,
      edges,
      trees: activeSheet.roots,
      sheets: mm.sheets,
      activeSheetId: activeSheet.id,
      mindmapMeta: { version: mm.version, created_at: mm.created_at, updated_at: mm.updated_at },
      isDirty: false,
      history: [{ nodes, edges, trees: activeSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
    });
  },

  newMindMap: (mm: MindMap) => {
    const activeSheet = mm.sheets.find(s => s.id === mm.active_sheet_id) ?? mm.sheets[0];
    const { nodes, edges } = mergeTreesToFlow(activeSheet.roots);
    set({
      nodes,
      edges,
      trees: activeSheet.roots,
      sheets: mm.sheets,
      activeSheetId: activeSheet.id,
      currentFilePath: '',
      mindmapMeta: { version: mm.version, created_at: mm.created_at, updated_at: mm.updated_at },
      isDirty: false,
      history: [{ nodes, edges, trees: activeSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
    });
  },

  pushHistory: () => {
    const { nodes, edges, trees, history, historyIndex } = get();
    if (trees.length === 0) return;
    const entry: HistoryEntry = { nodes: [...nodes], edges: [...edges], trees: [...trees] };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  onNodesChange: (changes: NodeChange[]) => {
    const state = get();
    const allChanges: NodeChange[] = [...changes];

    for (const change of changes) {
      if (change.type !== 'position') continue;
      const posChange = change as { type: 'position'; id: string; position?: { x: number; y: number }; dragging?: boolean };
      if (!posChange.position) continue;

      // ルートノードのドラッグ時のみ子孫を追従させる
      if (!state.trees.some(t => t.id === posChange.id)) continue;

      const movingNode = state.nodes.find(n => n.id === posChange.id);
      if (!movingNode) continue;

      const dx = posChange.position.x - movingNode.position.x;
      const dy = posChange.position.y - movingNode.position.y;
      if (dx === 0 && dy === 0) continue;

      // 子孫IDを再帰的に収集してデルタ分だけ移動
      const collectDescendants = (nodeId: string): string[] => {
        const childIds = state.edges.filter(e => e.source === nodeId).map(e => e.target);
        return [...childIds, ...childIds.flatMap(cid => collectDescendants(cid))];
      };

      for (const descId of collectDescendants(posChange.id)) {
        const descNode = state.nodes.find(n => n.id === descId);
        if (!descNode) continue;
        allChanges.push({
          type: 'position',
          id: descId,
          position: { x: descNode.position.x + dx, y: descNode.position.y + dy },
          dragging: posChange.dragging,
        } as NodeChange);
      }
    }

    const newNodes = applyNodeChanges(allChanges, state.nodes);
    // selectNodesOnDrag でクリック無しに選択される場合も selectedNodeId を同期する
    const selectChange = changes.find(c => c.type === 'select' && (c as { selected: boolean }).selected) as { id: string } | undefined;

    // 新追加ノードや画像追加後の実測計測後に再レイアウト
    const pendingIds = state.pendingLayoutIds;
    if (pendingIds.size > 0 && state.trees.length > 0) {
      const measuredIds = changes
        .filter(c => c.type === 'dimensions' && pendingIds.has((c as { id: string }).id))
        .map(c => (c as { id: string }).id);
      if (measuredIds.length > 0) {
        const { heights, widths } = buildNodeSizes(newNodes);
        // 全ツリーを現在の RF ノード位置に同期し、対象ツリーのみ再レイアウト
        const syncedTrees = state.trees.map(t => flowToTree(newNodes, state.edges, t));
        const affectedIdxSet = new Set(measuredIds.map(id => findTreeIndex(syncedTrees, id)).filter(i => i !== -1));
        const newTrees = syncedTrees.map((t, i) =>
          affectedIdxSet.has(i) ? computeLayout(t, heights, widths) : t
        );
        const { nodes: laidNodes, edges: laidEdges } = mergeTreesToFlow(newTrees);
        const newPending = new Set(pendingIds);
        measuredIds.forEach(id => newPending.delete(id));
        set({
          nodes: laidNodes,
          edges: laidEdges,
          trees: newTrees,
          pendingLayoutIds: newPending,
          isDirty: true,
          ...(selectChange ? { selectedNodeId: selectChange.id } : {}),
        });
        return;
      }
    }

    // select / dimensions のみの変更はデータ変更ではないため dirty にしない
    const hasDirtyChange = changes.some(c => c.type !== 'select' && c.type !== 'dimensions');
    set({ nodes: newNodes, ...(hasDirtyChange ? { isDirty: true } : {}), ...(selectChange ? { selectedNodeId: selectChange.id } : {}) });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const newEdges = applyEdgeChanges(changes, get().edges);
    const hasDirtyChange = changes.some(c => c.type !== 'select');
    set({ edges: newEdges, ...(hasDirtyChange ? { isDirty: true } : {}) });
  },

  updateNodeLabel: (nodeId: string, label: string) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  updateNodeTextAlign: (nodeId: string, textAlign: 'left' | 'center' | 'right') => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, textAlign } } : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  updateNodeColor: (nodeId: string, color: string) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, color } } : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  updateNodeImage: (nodeId: string, image: string) => {
    get().pushHistory();
    // 画像の追加/削除でノード高さが変わるため pendingLayoutIds に追加して
    // React Flow の再計測後に自動的にレイアウトを再構築する
    set(state => {
      const node = state.nodes.find(n => n.id === nodeId);
      const currentWidth = (node?.data as { nodeWidth?: number })?.nodeWidth;
      // 画像追加時に対して幅指定をしていない場合は自動で幅を広げる
      const shouldExpand = !!image && !currentWidth;
      return {
        nodes: state.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const newData = { ...n.data, image } as Record<string, unknown>;
          if (shouldExpand) newData.nodeWidth = 280;
          return {
            ...n,
            data: newData,
            ...(shouldExpand ? { style: { ...n.style, width: 280 } } : {}),
          };
        }),
        isDirty: true,
        pendingLayoutIds: new Set([...state.pendingLayoutIds, nodeId]),
      };
    });
    get()._syncTree();
  },

  updateNodeSize: (nodeId: string, width: number) => {
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId
          ? { ...n, style: { ...n.style, width }, data: { ...n.data, nodeWidth: width } }
          : n
      ),
      isDirty: true,
    }));
    get()._syncTree();
  },

  addChildNode: (parentId: string, direction?: 'right' | 'left') => {
    const { nodes, edges, trees } = get();
    const treeIdx = findTreeIndex(trees, parentId);
    if (treeIdx === -1) return;
    const tree = trees[treeIdx];
    get().pushHistory();

    const parentNode = nodes.find(n => n.id === parentId);
    if (!parentNode) return;

    // direction の決定:
    //   ルート親: 引数で右/左を指定、デフォルト 'right'
    //   非ルート親: 必ず親と同じ方向（逆向きは描画できないため）
    const parentDirection = (parentNode.data as { direction?: 'right' | 'left' }).direction ?? 'right';
    const isRootParent = tree.id === parentId;
    const nodeDirection = isRootParent ? (direction ?? 'right') : parentDirection;

    const newId = generateNodeId();
    const newTreeNode: MindMapNode = {
      id: newId,
      label: '新しいノード',
      textAlign: 'center',
      color: '#94A3B8',
      x: 0,
      y: 0,
      direction: nodeDirection,
      children: [],
    };

    // 現在の RF ノード位置を全ツリーに反映（他ツリーのドラッグ位置を保持するため全件同期）
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    const syncedTree = syncedTrees[treeIdx];
    function addToTree(node: MindMapNode): MindMapNode {
      if (node.id === parentId) {
        return { ...node, children: [...(node.children ?? []), newTreeNode] };
      }
      return { ...node, children: (node.children ?? []).map(addToTree) };
    }
    const treeWithNew = addToTree(syncedTree);

    // 変更したツリーのみレイアウト、他のツリーは現在の位置を保持
    const { heights, widths } = buildNodeSizes(nodes);
    const finalTrees = syncedTrees.map((t, i) =>
      i === treeIdx ? computeLayout(treeWithNew, heights, widths) : t
    );
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(finalTrees);
    const prevPending = get().pendingLayoutIds;
    set({
      trees: finalTrees, nodes: newNodes, edges: newEdges, isDirty: true, selectedNodeId: newId,
      pendingLayoutIds: new Set([...prevPending, newId]),
    });
  },

  addChildNodeLeft: (parentId: string) => {
    get().addChildNode(parentId, 'left');
  },

  addSiblingNode: (nodeId: string) => {
    const { edges, nodes } = get();
    const parentEdge = edges.find(e => e.target === nodeId);
    if (parentEdge) {
      // 自分自身の direction を取得して同じ方向に兄弟を追加
      const selfNode = nodes.find(n => n.id === nodeId);
      const selfDirection = (selfNode?.data as { direction?: 'right' | 'left' })?.direction ?? 'right';
      get().addChildNode(parentEdge.source, selfDirection);
    }
  },

  deleteNode: (nodeId: string) => {
    const { nodes, edges, trees } = get();
    get().pushHistory();

    // ツリー構造から削除対象ノードとその全子孫を収集
    // （edgesはReact Flowが先に削除済みの場合があるためtreesから取得する）
    const toDelete = new Set<string>();
    function collectFromTree(node: MindMapNode) {
      toDelete.add(node.id);
      for (const child of node.children ?? []) {
        collectFromTree(child);
      }
    }
    for (const tree of trees) {
      const target = findNodeInTree(tree, nodeId);
      if (target) {
        collectFromTree(target);
        break;
      }
    }

    // ルートノードの場合はtreesから直接除去、非ルートは子から削除
    function removeFromTree(node: MindMapNode): MindMapNode {
      return {
        ...node,
        children: (node.children ?? [])
          .filter(c => !toDelete.has(c.id))
          .map(removeFromTree),
      };
    }
    const newTrees = trees.filter(t => !toDelete.has(t.id)).map(removeFromTree);

    set({
      nodes: nodes.filter(n => !toDelete.has(n.id)),
      edges: edges.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)),
      trees: newTrees,
      isDirty: true,
      selectedNodeId: null,
    });
  },

  deleteSelectedNodes: () => {
    const { nodes, edges, trees } = get();
    const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedIds.length === 0) return;
    get().pushHistory();

    const toDeleteMulti = new Set<string>();
    function collectSelected(node: MindMapNode) {
      toDeleteMulti.add(node.id);
      for (const child of node.children ?? []) collectSelected(child);
    }
    for (const selId of selectedIds) {
      for (const tree of trees) {
        const target = findNodeInTree(tree, selId);
        if (target) { collectSelected(target); break; }
      }
    }

    function removeFromTreeMulti(node: MindMapNode): MindMapNode {
      return {
        ...node,
        children: (node.children ?? [])
          .filter(c => !toDeleteMulti.has(c.id))
          .map(removeFromTreeMulti),
      };
    }
    const newTreesMulti = trees.filter(t => !toDeleteMulti.has(t.id)).map(removeFromTreeMulti);

    set({
      nodes: nodes.filter(n => !toDeleteMulti.has(n.id)),
      edges: edges.filter(e => !toDeleteMulti.has(e.source) && !toDeleteMulti.has(e.target)),
      trees: newTreesMulti,
      isDirty: true,
      selectedNodeId: null,
    });
  },

  toggleCollapse: (nodeId: string) => {
    const { trees } = get();
    const treeIdx = findTreeIndex(trees, nodeId);
    if (treeIdx === -1) return;
    get().pushHistory();

    function toggleInTree(node: MindMapNode): MindMapNode {
      if (node.id === nodeId) {
        return { ...node, collapsed: !node.collapsed };
      }
      return { ...node, children: node.children?.map(toggleInTree) };
    }

    const newTrees = [...trees];
    newTrees[treeIdx] = toggleInTree(trees[treeIdx]);
    const { nodes, edges } = mergeTreesToFlow(newTrees);
    set({ trees: newTrees, nodes, edges, isDirty: true });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setDropTargetId: (id) => set({ dropTargetId: id }),
  setMouseFlowPosition: (pos) => set({ mouseFlowPosition: pos }),

  moveNodeUp: (nodeId: string) => {
    const { trees, nodes, edges } = get();
    if (trees.some(t => t.id === nodeId)) return; // ルートは移動不可
    get().pushHistory();

    // 現在の画面上位置をツリーに反映させてから带び替え
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));

    function reorderInTree(node: MindMapNode): MindMapNode {
      const idx = (node.children ?? []).findIndex(c => c.id === nodeId);
      if (idx > 0) {
        const newChildren = [...(node.children ?? [])];
        [newChildren[idx - 1], newChildren[idx]] = [newChildren[idx], newChildren[idx - 1]];
        return { ...node, children: newChildren };
      }
      return { ...node, children: (node.children ?? []).map(reorderInTree) };
    }

    const newTrees = syncedTrees.map(reorderInTree);
    const { heights: mhUp, widths: mwUp } = buildNodeSizes(nodes);
    const laidTrees = computeMultiLayout(newTrees, mhUp, mwUp);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
    set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true });
  },

  moveNodeDown: (nodeId: string) => {
    const { trees, nodes, edges } = get();
    if (trees.some(t => t.id === nodeId)) return; // ルートは移動不可
    get().pushHistory();

    // 現在の画面上位置をツリーに反映させてから带び替え
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));

    function reorderInTree(node: MindMapNode): MindMapNode {
      const children = node.children ?? [];
      const idx = children.findIndex(c => c.id === nodeId);
      if (idx !== -1 && idx < children.length - 1) {
        const newChildren = [...children];
        [newChildren[idx], newChildren[idx + 1]] = [newChildren[idx + 1], newChildren[idx]];
        return { ...node, children: newChildren };
      }
      return { ...node, children: children.map(reorderInTree) };
    }

    const newTrees = syncedTrees.map(reorderInTree);
    const { heights: mhDown, widths: mwDown } = buildNodeSizes(nodes);
    const laidTrees = computeMultiLayout(newTrees, mhDown, mwDown);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
    set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true });
  },

  reorderNodeAmongSiblings: (nodeId: string, insertBeforeSiblingId: string | null) => {
    const { trees, nodes, edges } = get();
    if (trees.some(t => t.id === nodeId)) return; // ルートは不可

    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));

    // 並び替えが必要かを事前チェック
    let changed = false;

    function reorderInTree(node: MindMapNode): MindMapNode {
      const children = node.children ?? [];
      const nodeIdx = children.findIndex(c => c.id === nodeId);
      if (nodeIdx === -1) {
        return { ...node, children: children.map(reorderInTree) };
      }

      const moved = children[nodeIdx];
      const remaining = children.filter((_, i) => i !== nodeIdx);

      let insertIdx: number;
      if (insertBeforeSiblingId === null) {
        // 同じ direction の末尾に挿入
        let lastSameDirIdx = -1;
        for (let i = remaining.length - 1; i >= 0; i--) {
          if (remaining[i].direction === moved.direction) {
            lastSameDirIdx = i;
            break;
          }
        }
        insertIdx = lastSameDirIdx + 1;
      } else {
        insertIdx = remaining.findIndex(c => c.id === insertBeforeSiblingId);
        if (insertIdx === -1) insertIdx = remaining.length;
      }

      // 元の位置と変わらない場合はそのまま返す
      if (insertIdx === nodeIdx) {
        return { ...node, children };
      }

      changed = true;
      const newChildren = [
        ...remaining.slice(0, insertIdx),
        moved,
        ...remaining.slice(insertIdx),
      ];
      return { ...node, children: newChildren };
    }

    const newTrees = syncedTrees.map(reorderInTree);
    if (!changed) return; // 変化なし → 何もしない

    get().pushHistory();
    const { heights: mhReo, widths: mwReo } = buildNodeSizes(nodes);
    const laidTrees = computeMultiLayout(newTrees, mhReo, mwReo);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
    set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true });
  },

  reparentNode: (nodeId: string, newParentId: string, direction?: 'right' | 'left') => {
    const { trees, nodes, edges } = get();
    if (nodeId === newParentId) return;
    if (trees.some(t => t.id === nodeId)) return; // ルートノードは付け替え不可

    function findNode(node: MindMapNode, id: string): MindMapNode | null {
      if (node.id === id) return node;
      for (const c of node.children ?? []) {
        const found = findNode(c, id);
        if (found) return found;
      }
      return null;
    }

    const srcTreeIdx = findTreeIndex(trees, nodeId);
    const tgtTreeIdx = findTreeIndex(trees, newParentId);
    if (srcTreeIdx === -1 || tgtTreeIdx === -1) return;

    // 全ツリーを現在の RF ノード位置に同期（ドラッグ済み位置を保持するため）
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    const srcTree = syncedTrees[srcTreeIdx];
    const tgtTree = syncedTrees[tgtTreeIdx];

    // 循環防止
    const subtreeRoot = findNode(srcTree, nodeId);
    if (!subtreeRoot) return;
    if (findNode(subtreeRoot, newParentId)) return;

    get().pushHistory();

    const newParentRF = nodes.find(n => n.id === newParentId);
    const newParentIsRoot = trees.some(t => t.id === newParentId);
    const newParentDir = (newParentRF?.data as { direction?: 'right' | 'left' }).direction ?? 'right';

    function updateDirection(node: MindMapNode, dir: 'right' | 'left'): MindMapNode {
      return {
        ...node,
        direction: dir,
        children: (node.children ?? []).map(c => updateDirection(c, dir)),
      };
    }

    let detached: MindMapNode | null = null;
    function detachFromTree(node: MindMapNode): MindMapNode {
      const newChildren = (node.children ?? []).filter(c => {
        if (c.id === nodeId) { detached = c; return false; }
        return true;
      }).map(detachFromTree);
      return { ...node, children: newChildren };
    }

    function attachToParent(node: MindMapNode, parentId: string, child: MindMapNode): MindMapNode {
      if (node.id === parentId) {
        return { ...node, children: [...(node.children ?? []), child] };
      }
      return { ...node, children: (node.children ?? []).map(c => attachToParent(c, parentId, child)) };
    }

    const newSrcTree = detachFromTree(srcTree);
    if (!detached) return;

    const dir = newParentIsRoot
      ? (direction ?? (detached as MindMapNode).direction ?? 'right')
      : newParentDir;
    const movedNode = updateDirection(detached as MindMapNode, dir);

    const newTrees = [...syncedTrees];
    if (srcTreeIdx === tgtTreeIdx) {
      // 同一ツリー内の付け替え
      newTrees[srcTreeIdx] = attachToParent(newSrcTree, newParentId, movedNode);
    } else {
      // 異なるツリー間の付け替え
      newTrees[srcTreeIdx] = newSrcTree;
      newTrees[tgtTreeIdx] = attachToParent(tgtTree, newParentId, movedNode);
    }
    const { heights: mhRep, widths: mwRep } = buildNodeSizes(nodes);
    const laidTrees = computeMultiLayout(newTrees, mhRep, mwRep);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
    set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true, dropTargetId: null });
  },

  reparentMultipleNodes: (nodeIds: string[], newParentId: string, direction?: 'right' | 'left') => {
    const { trees, nodes, edges } = get();
    if (nodeIds.length === 0) return;
    const rootIds = new Set(trees.map(t => t.id));

    // ルートと移動先自身を除外
    const candidates = nodeIds.filter(id => id !== newParentId && !rootIds.has(id));
    if (candidates.length === 0) return;

    // 他のcandidateの子孫であるノードは除外（祖先ごと移動するため）
    function getDescendantIds(nodeId: string): Set<string> {
      const result = new Set<string>();
      function collect(id: string) {
        edges.filter(e => e.source === id).forEach(e => { result.add(e.target); collect(e.target); });
      }
      collect(nodeId);
      return result;
    }

    const toReparent = candidates.filter(id => {
      for (const other of candidates) {
        if (other === id) continue;
        if (getDescendantIds(other).has(id)) return false;
      }
      return true;
    });

    if (toReparent.length === 0) return;

    // 循環防止: 移動先がいずれかの移動ノードの子孫であれば中止
    for (const id of toReparent) {
      const desc = getDescendantIds(id);
      desc.add(id);
      if (desc.has(newParentId)) return;
    }

    if (findTreeIndex(trees, newParentId) === -1) return;

    get().pushHistory();

    const newParentRF = nodes.find(n => n.id === newParentId);
    const newParentIsRoot = rootIds.has(newParentId);
    const newParentDir = (newParentRF?.data as { direction?: 'right' | 'left' }).direction ?? 'right';

    function updateDirection(node: MindMapNode, dir: 'right' | 'left'): MindMapNode {
      return { ...node, direction: dir, children: (node.children ?? []).map(c => updateDirection(c, dir)) };
    }

    function detachNode(treeNode: MindMapNode, targetId: string): { tree: MindMapNode; detached: MindMapNode | null } {
      let detached: MindMapNode | null = null;
      function walk(node: MindMapNode): MindMapNode {
        const newChildren = (node.children ?? []).filter(c => {
          if (c.id === targetId) { detached = c; return false; }
          return true;
        }).map(walk);
        return { ...node, children: newChildren };
      }
      return { tree: walk(treeNode), detached };
    }

    function attachToParent(node: MindMapNode, parentId: string, child: MindMapNode): MindMapNode {
      if (node.id === parentId) return { ...node, children: [...(node.children ?? []), child] };
      return { ...node, children: (node.children ?? []).map(c => attachToParent(c, parentId, child)) };
    }

    let currentTrees = trees.map(t => flowToTree(nodes, edges, t));

    for (const nodeId of toReparent) {
      const srcIdx = findTreeIndex(currentTrees, nodeId);
      if (srcIdx === -1) continue;

      const { tree: newSrc, detached } = detachNode(currentTrees[srcIdx], nodeId);
      if (!detached) continue;

      const dir = newParentIsRoot
        ? (direction ?? (detached as MindMapNode).direction ?? 'right')
        : newParentDir;
      const movedNode = updateDirection(detached as MindMapNode, dir);

      currentTrees = [...currentTrees];
      currentTrees[srcIdx] = newSrc;

      const tgtIdx = findTreeIndex(currentTrees, newParentId);
      if (tgtIdx === -1) continue;
      currentTrees[tgtIdx] = attachToParent(currentTrees[tgtIdx], newParentId, movedNode);
    }

    const { heights: mhM, widths: mwM } = buildNodeSizes(nodes);
    const laidTrees = computeMultiLayout(currentTrees, mhM, mwM);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
    set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true, dropTargetId: null });
  },

  undo: () => {
    const { history, historyIndex, nodes: curNodes, edges: curEdges, trees: curTrees } = get();
    if (historyIndex <= 0) return;
    // pushHistory は「アクション直前の状態」を history[historyIndex] に保存する。
    // undo ではその entry を復元し、現在の状態を history[historyIndex] に swap して
    // redo で戻れるようにする。
    const entry = history[historyIndex];
    const newHistory = [...history];
    newHistory[historyIndex] = { nodes: curNodes, edges: curEdges, trees: curTrees };
    const { nodes, edges } = mergeTreesToFlow(entry.trees);
    set({ nodes, edges, trees: entry.trees, historyIndex: historyIndex - 1, history: newHistory, isDirty: true, pendingLayoutIds: new Set() });
  },

  redo: () => {
    const { history, historyIndex, nodes: curNodes, edges: curEdges, trees: curTrees } = get();
    if (historyIndex >= history.length - 1) return;
    const entry = history[historyIndex + 1];
    const newHistory = [...history];
    newHistory[historyIndex + 1] = { nodes: curNodes, edges: curEdges, trees: curTrees };
    const { nodes, edges } = mergeTreesToFlow(entry.trees);
    set({ nodes, edges, trees: entry.trees, historyIndex: historyIndex + 1, history: newHistory, isDirty: true, pendingLayoutIds: new Set() });
  },

  autoLayout: () => {
    const { trees, nodes, edges } = get();
    if (trees.length === 0) return;
    get().pushHistory();
    const { heights, widths } = buildNodeSizes(nodes);
    // ドラッグ等でRFノード位置が変わっていてもtreesに未反映の場合があるため同期する
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    const newTrees = computeMultiLayoutWithSpacing(syncedTrees, heights, widths);
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(newTrees);
    set({ nodes: newNodes, edges: newEdges, trees: newTrees, isDirty: true, fitViewTrigger: get().fitViewTrigger + 1 });
  },

  toMindMap: () => {
    const { nodes, edges, trees, sheets, activeSheetId, mindmapMeta } = get();
    if (!mindmapMeta) return null;
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    // アクティブシートのroots を最新状態で差し替えたシート一覧を構築する
    const updatedSheets: Sheet[] = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );
    return {
      ...mindmapMeta,
      updated_at: new Date().toISOString(),
      sheets: updatedSheets,
      active_sheet_id: activeSheetId,
    };
  },

  saveError: null as string | null,
  clearSaveError: () => set({ saveError: null }),

  saveFile: async () => {
    const mm = get().toMindMap();
    if (!mm) return;
    try {
      const path = await wailsClient.saveFile(mm);
      if (path) set({ currentFilePath: path, isDirty: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ saveError: msg });
    }
  },

  _autoSaveTimer: undefined as ReturnType<typeof setInterval> | undefined,

  saveAsFile: async () => {
    const mm = get().toMindMap();
    if (!mm) return;
    try {
      const path = await wailsClient.saveAsFile(mm);
      if (path) set({ currentFilePath: path, isDirty: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ saveError: msg });
    }
  },

  openFile: async () => {
    const mm = await wailsClient.openFile();
    if (mm) {
      get().loadMindMap(mm);
      const path = await wailsClient.getCurrentFilePath();
      set({ currentFilePath: path });
    }
  },

  openFileByPath: async (path: string) => {
    const mm = await wailsClient.openFileByPath(path);
    if (mm) {
      get().loadMindMap(mm);
      set({ currentFilePath: path });
    }
  },

  exportMarkdown: async () => {
    const mm = get().toMindMap();
    if (!mm) return;
    await wailsClient.exportMarkdown(mm);
  },

  addRootNode: (position?: { x: number; y: number }) => {
    const { nodes, edges, trees } = get();
    get().pushHistory();
    // ドラッグ等でRFノードの位置が変わっていてもtreesに反映されていないことがあるため、
    // 現在のRFノード位置をtreesに同期してからルートを追加する
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    // 位置が指定されていない場合は既存ノードの最下部より下に配置
    const posX = position?.x ?? -80;
    const posY = position?.y ?? (nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 180 : 0);
    const newId = generateNodeId();
    const newRoot: MindMapNode = {
      id: newId,
      label: '新しいルート',
      textAlign: 'center',
      color: '#60A5FA',
      x: posX,
      y: posY,
      children: [],
    };
    const newTrees = [...syncedTrees, newRoot];
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(newTrees);
    set({ trees: newTrees, nodes: newNodes, edges: newEdges, isDirty: true, selectedNodeId: newId });
  },

  copyNode: (nodeId: string) => {
    const { nodes, edges, trees } = get();
    const isRoot = trees.some(t => t.id === nodeId);
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    let found: MindMapNode | null = null;
    for (const t of syncedTrees) {
      found = findNodeInTree(t, nodeId);
      if (found) break;
    }
    if (!found) return;
    set({ clipboard: { node: found, isRoot } });
  },

  pasteNode: (targetNodeId?: string, asRoot?: boolean) => {
    const { clipboard, trees, nodes, edges } = get();
    if (!clipboard) return;
    get().pushHistory();

    function cloneWithNewIds(node: MindMapNode): MindMapNode {
      return { ...node, id: generateNodeId(), children: (node.children ?? []).map(cloneWithNewIds) };
    }
    const cloned = cloneWithNewIds(clipboard.node);
    const syncedTrees = trees.map(t => flowToTree(nodes, edges, t));
    const { heights, widths } = buildNodeSizes(nodes);

    if (clipboard.isRoot || asRoot) {
      // ルートノードとして追加（マウス位置があればそこに、なければ画面下部）
      const mousePos = get().mouseFlowPosition;
      const posX = mousePos?.x ?? -80;
      const posY = mousePos?.y ?? (nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 180 : 0);
      const newRoot: MindMapNode = { ...cloned, x: posX, y: posY, direction: undefined };
      const newTrees = [...syncedTrees, newRoot];
      const laidTrees = computeMultiLayout(newTrees, heights, widths);
      const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
      set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true, selectedNodeId: cloned.id });
    } else {
      // 指定したノード（またはselectedNode）の子として追加
      const targetId = targetNodeId ?? get().selectedNodeId;
      if (!targetId) return;
      const treeIdx = findTreeIndex(syncedTrees, targetId);
      if (treeIdx === -1) return;

      const isTargetRoot = syncedTrees.some(t => t.id === targetId);
      const targetRFNode = nodes.find(n => n.id === targetId);
      const targetDirection = isTargetRoot
        ? 'right'
        : (targetRFNode?.data as { direction?: 'right' | 'left' }).direction ?? 'right';

      function updateDirection(node: MindMapNode, d: 'right' | 'left'): MindMapNode {
        return { ...node, direction: d, children: (node.children ?? []).map(c => updateDirection(c, d)) };
      }
      const directedClone = updateDirection(cloned, targetDirection);

      function addToTree(node: MindMapNode): MindMapNode {
        if (node.id === targetId) {
          return { ...node, children: [...(node.children ?? []), directedClone] };
        }
        return { ...node, children: (node.children ?? []).map(addToTree) };
      }
      const newTrees = syncedTrees.map((t, i) => i === treeIdx ? addToTree(t) : t);
      const laidTrees = computeMultiLayout(newTrees, heights, widths);
      const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(laidTrees);
      set({ trees: laidTrees, nodes: newNodes, edges: newEdges, isDirty: true, selectedNodeId: directedClone.id });
    }
  },

  // 内部: React FlowのノードリストからツリーをSyncする
  _syncTree: () => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    const newTrees = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: newTrees } : s
    );
    set({ trees: newTrees, sheets: updatedSheets });
  },
  // ─── シート操作 ────────────────────────────────────────────

  switchSheet: (id: string) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    if (id === activeSheetId) return;
    const targetSheet = sheets.find(s => s.id === id);
    if (!targetSheet) return;

    // 現在のシートの状態をsheetsに保存
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    // 新しいシートをロード
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(targetSheet.roots);
    set({
      sheets: updatedSheets,
      activeSheetId: id,
      nodes: newNodes,
      edges: newEdges,
      trees: targetSheet.roots,
      selectedNodeId: null,
      contextMenu: null,
      history: [{ nodes: newNodes, edges: newEdges, trees: targetSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
      isDirty: true,
      fitViewTrigger: get().fitViewTrigger + 1,
    });
  },

  addSheet: () => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();

    // 現在のシートを保存
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    const newId = `sheet-${Date.now()}`;
    const newSheetNum = updatedSheets.length + 1;
    const newRootId = `root-${Date.now()}`;
    const newSheet: Sheet = {
      id: newId,
      name: `Sheet ${newSheetNum}`,
      roots: [{ id: newRootId, label: 'テーマ', textAlign: 'center', color: '#60A5FA', x: 0, y: 0 }],
    };
    const newSheets = [...updatedSheets, newSheet];
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(newSheet.roots);
    set({
      sheets: newSheets,
      activeSheetId: newId,
      nodes: newNodes,
      edges: newEdges,
      trees: newSheet.roots,
      selectedNodeId: null,
      contextMenu: null,
      history: [{ nodes: newNodes, edges: newEdges, trees: newSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
      isDirty: true,
      fitViewTrigger: get().fitViewTrigger + 1,
    });
  },

  duplicateSheet: (id: string) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();

    // 現在のシートを保存
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    // 複製対象のシートのrootsを取得
    const sourceSheet = updatedSheets.find(s => s.id === id);
    if (!sourceSheet) return;

    // ノードIDを再帰的に新規IDに置き換えてディープコピー
    const cloneTree = (node: MindMapNode): MindMapNode => ({
      ...node,
      id: generateNodeId(),
      children: (node.children ?? []).map(cloneTree),
    });
    const clonedRoots = sourceSheet.roots.map(cloneTree);

    const newId = `sheet-${Date.now()}`;
    const srcIndex = updatedSheets.findIndex(s => s.id === id);
    const newSheet: Sheet = {
      id: newId,
      name: `${sourceSheet.name} のコピー`,
      roots: clonedRoots,
    };
    // 元シートの隣に挿入
    const newSheets = [
      ...updatedSheets.slice(0, srcIndex + 1),
      newSheet,
      ...updatedSheets.slice(srcIndex + 1),
    ];
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(newSheet.roots);
    set({
      sheets: newSheets,
      activeSheetId: newId,
      nodes: newNodes,
      edges: newEdges,
      trees: newSheet.roots,
      selectedNodeId: null,
      contextMenu: null,
      history: [{ nodes: newNodes, edges: newEdges, trees: newSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
      isDirty: true,
      fitViewTrigger: get().fitViewTrigger + 1,
    });
  },

  deleteSheet: (id: string) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    if (sheets.length <= 1) return; // 最後の1枚は削除不可

    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );
    const idx = updatedSheets.findIndex(s => s.id === id);
    const newSheets = updatedSheets.filter(s => s.id !== id);

    // 削除後にアクティブにするシートを決定
    let nextId = activeSheetId;
    if (id === activeSheetId) {
      nextId = newSheets[Math.max(0, idx - 1)].id;
    }
    const nextSheet = newSheets.find(s => s.id === nextId)!;
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(nextSheet.roots);
    set({
      sheets: newSheets,
      activeSheetId: nextId,
      nodes: newNodes,
      edges: newEdges,
      trees: nextSheet.roots,
      selectedNodeId: null,
      contextMenu: null,
      history: [{ nodes: newNodes, edges: newEdges, trees: nextSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(),
      isDirty: true,
    });
  },

  renameSheet: (id: string, name: string) => {
    const { sheets } = get();
    const newSheets = sheets.map(s => s.id === id ? { ...s, name } : s);
    set({ sheets: newSheets, isDirty: true });
  },

  moveSheetLeft: (id: string) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    const idx = sheets.findIndex(s => s.id === id);
    if (idx <= 0) return;

    // 現在のアクティブシートの編集内容を先に反映
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const syncedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    const reordered = [...syncedSheets];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    set({ sheets: reordered, isDirty: true });
  },

  moveSheetRight: (id: string) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    const idx = sheets.findIndex(s => s.id === id);
    if (idx === -1 || idx >= sheets.length - 1) return;

    // 現在のアクティブシートの編集内容を先に反映
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const syncedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    const reordered = [...syncedSheets];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    set({ sheets: reordered, isDirty: true });
  },

  reorderSheet: (fromId: string, insertBeforeId: string | null) => {
    const { nodes, edges, trees, sheets, activeSheetId } = get();
    const fromIdx = sheets.findIndex(s => s.id === fromId);
    if (fromIdx === -1) return;
    if (insertBeforeId === fromId) return;

    // 現在のアクティブシートの編集内容を先に反映
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const syncedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    const moving = syncedSheets[fromIdx];
    const without = syncedSheets.filter(s => s.id !== fromId);
    const insertIdx = insertBeforeId === null
      ? without.length
      : without.findIndex(s => s.id === insertBeforeId);
    const finalIdx = insertIdx === -1 ? without.length : insertIdx;
    const reordered = [
      ...without.slice(0, finalIdx),
      moving,
      ...without.slice(finalIdx),
    ];
    set({ sheets: reordered, isDirty: true });
  },

  importSheets: async () => {
    const result = await wailsClient.importFile();
    if (!result || !result.sheets || result.sheets.length === 0) return;

    const { nodes, edges, trees, sheets, activeSheetId } = get();

    // 現在のシートを保存
    const syncedRoots = trees.map(tree => flowToTree(nodes, edges, tree));
    const updatedSheets = sheets.map(s =>
      s.id === activeSheetId ? { ...s, roots: syncedRoots } : s
    );

    // ノードIDを再帰的に新規IDに置き換えてディープコピー
    const cloneTree = (node: MindMapNode): MindMapNode => ({
      ...node,
      id: generateNodeId(),
      children: (node.children ?? []).map(cloneTree),
    });

    const newSheets: Sheet[] = result.sheets.map(srcSheet => {
      const clonedRoots = srcSheet.roots.map(cloneTree);
      const laidRoots = computeMultiLayoutWithSpacing(clonedRoots);
      return {
        id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `${result.file_name}_${srcSheet.name}`,
        roots: laidRoots,
      };
    });

    const allSheets = [...updatedSheets, ...newSheets];
    const firstNewSheet = newSheets[0];
    const { nodes: newNodes, edges: newEdges } = mergeTreesToFlow(firstNewSheet.roots);
    const importedNodeIds = collectTreeNodeIds(firstNewSheet.roots);
    set({
      sheets: allSheets,
      activeSheetId: firstNewSheet.id,
      nodes: newNodes,
      edges: newEdges,
      trees: firstNewSheet.roots,
      selectedNodeId: null,
      contextMenu: null,
      history: [{ nodes: newNodes, edges: newEdges, trees: firstNewSheet.roots }],
      historyIndex: 0,
      pendingLayoutIds: new Set(importedNodeIds),
      isDirty: true,
      fitViewTrigger: get().fitViewTrigger + 1,
    });
  },

} as MindMapStore & { _syncTree: () => void; _autoSaveTimer: ReturnType<typeof setInterval> | undefined }));

// ─── 自動保存タイマー管理 ────────────────────────────────────
const AUTO_SAVE_INTERVAL_MS = 5_000; // 5秒

const store = useMindMapStore as typeof useMindMapStore & { _autoSaveTimer?: ReturnType<typeof setInterval> };

useMindMapStore.subscribe((state, prev) => {
  const autoSaveChanged = state.autoSave !== prev.autoSave;
  if (!autoSaveChanged) return;

  if (store._autoSaveTimer !== undefined) {
    clearInterval(store._autoSaveTimer);
    store._autoSaveTimer = undefined;
  }

  if (state.autoSave) {
    store._autoSaveTimer = setInterval(() => {
      const s = useMindMapStore.getState();
      if (s.isDirty && s.currentFilePath) {
        s.saveFile();
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }
});
