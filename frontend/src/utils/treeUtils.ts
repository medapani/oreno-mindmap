/**
 * MindMapNodeツリー ↔ React Flow フラット形式の変換ユーティリティ
 */

import { MindMapNode, FlowNode, FlowEdge, MindMap } from '../types/mindmap';
import { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

export function treeToFlow(root: MindMapNode): { nodes: RFNode[]; edges: RFEdge[] } {
  const nodes: RFNode[] = [];
  const edges: RFEdge[] = [];

  function traverse(node: MindMapNode, parentId?: string, inheritedDirection?: 'right' | 'left') {
    const direction = node.direction ?? inheritedDirection;
    nodes.push({
      id: node.id,
      type: 'mindmapNode',
      position: { x: node.x, y: node.y },
      data: {
        label: node.label,
        textAlign: node.textAlign ?? 'center',
        color: node.color,
        image: node.image,
        collapsed: node.collapsed ?? false,
        isRoot: !parentId,
        direction,
        hasChildren: !!(node.children && node.children.length > 0),
        nodeWidth: node.width,
      },
      style: node.width ? { width: node.width } : undefined,
    } as RFNode);

    if (parentId) {
      const isLeft = direction === 'left';
      edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        sourceHandle: isLeft ? 'source-left' : 'source-right',
        targetHandle: isLeft ? 'target-right' : 'target-left',
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      } as RFEdge);
    }

    if (!node.collapsed && node.children) {
      for (const child of node.children) {
        traverse(child, node.id, direction);
      }
    }
  }

  traverse(root);
  return { nodes, edges };
}

export function flowToTree(
  nodes: RFNode[],
  edges: RFEdge[],
  originalRoot: MindMapNode
): MindMapNode {
  // React Flowの視覚ノードからデータを取得
  const rfDataMap = new Map<string, RFNode>();
  for (const n of nodes) rfDataMap.set(n.id, n);

  // エッジから parent->childrenリストを構築（新規ノードの接続找しに使用）
  const edgeChildMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!edgeChildMap.has(e.source)) edgeChildMap.set(e.source, []);
    edgeChildMap.get(e.source)!.push(e.target);
  }

  // オリジナルツリーに存在する IDセット
  const existingIds = new Set<string>();
  function collectIds(n: MindMapNode) {
    existingIds.add(n.id);
    n.children?.forEach(collectIds);
  }
  collectIds(originalRoot);

  // RFにあってツリーにない新規ノードのデータを事先構築
  const newNodeDataMap = new Map<string, MindMapNode>();
  for (const rfNode of nodes) {
    if (!existingIds.has(rfNode.id)) {
      newNodeDataMap.set(rfNode.id, {
        id: rfNode.id,
        x: rfNode.position.x,
        y: rfNode.position.y,
        label: (rfNode.data as { label: string }).label,
        textAlign: (rfNode.data as { textAlign?: 'left' | 'center' | 'right' }).textAlign ?? 'center',
        color: (rfNode.data as { color: string }).color,
        image: (rfNode.data as { image?: string }).image,
        collapsed: (rfNode.data as { collapsed?: boolean }).collapsed ?? false,
        direction: (rfNode.data as { direction?: 'right' | 'left' }).direction,
        width: (rfNode.data as { nodeWidth?: number }).nodeWidth,
        children: [],
      });
    }
  }

  // 新規ノードの子をエッジから再帰的に橋渡し
  function buildNewNode(id: string): MindMapNode {
    const node = { ...newNodeDataMap.get(id)!, children: [] as MindMapNode[] };
    const childIds = edgeChildMap.get(id) ?? [];
    node.children = childIds
      .filter(cid => newNodeDataMap.has(cid))
      .map(cid => buildNewNode(cid));
    return node;
  }

  // 既存ツリーを再帰的に更新（構造は変えず、表示中のノードの属性のみ更新）
  function updateExisting(node: MindMapNode): MindMapNode {
    const rf = rfDataMap.get(node.id);
    const updated: MindMapNode = rf
      ? {
        ...node,
        x: rf.position.x,
        y: rf.position.y,
        label: (rf.data as { label: string }).label ?? node.label,
        textAlign: (rf.data as { textAlign?: 'left' | 'center' | 'right' }).textAlign ?? node.textAlign ?? 'center',
        color: (rf.data as { color: string }).color ?? node.color,
        image: (rf.data as { image?: string }).image ?? node.image,
        collapsed: (rf.data as { collapsed?: boolean }).collapsed ?? node.collapsed,
        direction: (rf.data as { direction?: 'right' | 'left' }).direction ?? node.direction,
        width: (rf.data as { nodeWidth?: number }).nodeWidth ?? node.width,
      }
      : { ...node };

    // 既存の子ノードは構造を保持したまま更新
    const updatedChildren = (node.children ?? []).map(updateExisting);

    // このノードを親とする新規ノードを追加
    const edgeChildIds = edgeChildMap.get(node.id) ?? [];
    const newChildren = edgeChildIds
      .filter(cid => newNodeDataMap.has(cid))
      .map(cid => buildNewNode(cid));

    return { ...updated, children: [...updatedChildren, ...newChildren] };
  }

  return updateExisting(originalRoot);
}

export function mindmapToFlowState(mm: MindMap) {
  const activeSheet = mm.sheets.find(s => s.id === mm.active_sheet_id) ?? mm.sheets[0];
  return mergeTreesToFlow(activeSheet?.roots ?? []);
}

/** 複数ルートツリーからReact Flowのノード・エッジをマージして生成 */
export function mergeTreesToFlow(roots: MindMapNode[]): { nodes: RFNode[]; edges: RFEdge[] } {
  const allNodes: RFNode[] = [];
  const allEdges: RFEdge[] = [];
  for (const root of roots) {
    const { nodes, edges } = treeToFlow(root);
    allNodes.push(...nodes);
    allEdges.push(...edges);
  }
  return { nodes: allNodes, edges: allEdges };
}

// ─── Auto Layout ────────────────────────────────────────────────────────────

const L_W = 160;       // ノードの概算幅（実測値がない場合のデフォルト）
const DEFAULT_L_H = 52; // ノードのデフォルト高さ（実測値がない場合）
const L_HG = 60;        // 水平ギャップ（ノード端間）
const L_VG = 22;        // 垂直ギャップ（兄弟間）


/** サブツリーが占める縦幅（heights に実測高さを使用） */
function subtreeHeight(node: MindMapNode, heights: Map<string, number>): number {
  const h = heights.get(node.id) ?? DEFAULT_L_H;
  if (node.collapsed || !node.children || node.children.length === 0) {
    return h;
  }
  const total = node.children.reduce(
    (sum, c, i) => sum + subtreeHeight(c, heights) + (i > 0 ? L_VG : 0),
    0
  );
  return Math.max(h, total);
}

/** サブツリーの位置を再帰的に計算する（cx/cy はノード中心） */
function layoutSubtree(
  node: MindMapNode,
  cx: number,
  cy: number,
  dir: 'right' | 'left',
  heights: Map<string, number>,
  widths: Map<string, number>,
): void {
  const h = heights.get(node.id) ?? DEFAULT_L_H;
  const w = widths.get(node.id) ?? L_W;
  node.x = cx - w / 2;
  node.y = cy - h / 2;  // 実際の高さを基準に中心から上方向へオフセット

  if (node.collapsed || !node.children || node.children.length === 0) return;

  // 各子のサブツリー高さを考慮して縦間隔を計算（重なりを防ぐ）
  const totalH = node.children.reduce(
    (sum, c, i) => sum + subtreeHeight(c, heights) + (i > 0 ? L_VG : 0),
    0
  );
  let y = cy - totalH / 2;
  for (const child of node.children) {
    const childDir = child.direction ?? dir;
    const ch = subtreeHeight(child, heights);
    const childW = widths.get(child.id) ?? L_W;
    // 親の端 + ギャップ + 子の半幅 = 子の中心X（実測幅を考慮）
    const childCx = dir === 'right'
      ? (cx + w / 2 + L_HG + childW / 2)
      : (cx - w / 2 - L_HG - childW / 2);
    layoutSubtree(child, childCx, y + ch / 2, childDir, heights, widths);
    y += ch + L_VG;
  }
}

/** ツリー全体を綺麗なマインドマップレイアウトに整列して返す */
export function computeLayout(
  root: MindMapNode,
  heights: Map<string, number> = new Map(),
  widths: Map<string, number> = new Map(),
): MindMapNode {
  // ディープクローン
  const cloned = JSON.parse(JSON.stringify(root)) as MindMapNode;

  const rightChildren = (cloned.children ?? []).filter(c => c.direction !== 'left');
  const leftChildren = (cloned.children ?? []).filter(c => c.direction === 'left');

  // ルートの現在位置を保持（中心座標を計算：実測高さ・幅を使用）
  const rootH = heights.get(cloned.id) ?? DEFAULT_L_H;
  const rootW = widths.get(cloned.id) ?? L_W;
  const rootCx = cloned.x + rootW / 2;  // 実測幅でルート中心Xを計算
  const rootCy = cloned.y + rootH / 2;

  // 右側をレイアウト（各サブツリー高さを考慮して重なりを防ぐ）
  const rightTotalH = rightChildren.reduce(
    (sum, c, i) => sum + subtreeHeight(c, heights) + (i > 0 ? L_VG : 0),
    0
  );
  let ry = rootCy - rightTotalH / 2;
  for (const child of rightChildren) {
    const ch = subtreeHeight(child, heights);
    const childW = widths.get(child.id) ?? L_W;
    const childCx = rootCx + rootW / 2 + L_HG + childW / 2;
    layoutSubtree(child, childCx, ry + ch / 2, 'right', heights, widths);
    ry += ch + L_VG;
  }

  // 左側をレイアウト（各サブツリー高さを考慮して重なりを防ぐ）
  const leftTotalH = leftChildren.reduce(
    (sum, c, i) => sum + subtreeHeight(c, heights) + (i > 0 ? L_VG : 0),
    0
  );
  let ly = rootCy - leftTotalH / 2;
  for (const child of leftChildren) {
    const ch = subtreeHeight(child, heights);
    const childW = widths.get(child.id) ?? L_W;
    const childCx = rootCx - rootW / 2 - L_HG - childW / 2;
    layoutSubtree(child, childCx, ly + ch / 2, 'left', heights, widths);
    ly += ch + L_VG;
  }

  return cloned;
}

/** ルートの現在位置を保持しつつ、各ツリーの子ノードをレイアウト */
export function computeMultiLayout(
  trees: MindMapNode[],
  heights: Map<string, number> = new Map(),
  widths: Map<string, number> = new Map(),
): MindMapNode[] {
  return trees.map(t => computeLayout(t, heights, widths));
}

/** ツリー全ノードのバウンディングボックスを返す */
function treeBounds(node: MindMapNode, heights: Map<string, number>): { minY: number; maxY: number } {
  const h = heights.get(node.id) ?? DEFAULT_L_H;
  let minY = node.y;
  let maxY = node.y + h;
  if (!node.collapsed) {
    for (const child of node.children ?? []) {
      const b = treeBounds(child, heights);
      minY = Math.min(minY, b.minY);
      maxY = Math.max(maxY, b.maxY);
    }
  }
  return { minY, maxY };
}

/** ツリー内の全ノードをY方向にオフセット */
function shiftTreeY(node: MindMapNode, dy: number): MindMapNode {
  return {
    ...node,
    y: node.y + dy,
    children: (node.children ?? []).map(c => shiftTreeY(c, dy)),
  };
}

const ROOT_TREE_VG = 80; // ルートツリー間の垂直ギャップ

/**
 * 全ツリーをレイアウトしたあと、バウンディングボックスが重ならないよう
 * 上から順に縦に並べ直す（autoLayout 専用）
 */
export function computeMultiLayoutWithSpacing(
  trees: MindMapNode[],
  heights: Map<string, number> = new Map(),
  widths: Map<string, number> = new Map(),
): MindMapNode[] {
  if (trees.length === 0) return [];

  // 各ツリーを個別にレイアウト
  const laidTrees = trees.map(t => computeLayout(t, heights, widths));

  // 1本目はそのまま基準にする
  const result: MindMapNode[] = [laidTrees[0]];
  let prevBounds = treeBounds(laidTrees[0], heights);

  for (let i = 1; i < laidTrees.length; i++) {
    const bounds = treeBounds(laidTrees[i], heights);
    const targetMinY = prevBounds.maxY + ROOT_TREE_VG;
    const dy = targetMinY - bounds.minY;
    const shifted = dy !== 0 ? shiftTreeY(laidTrees[i], dy) : laidTrees[i];
    result.push(shifted);
    prevBounds = treeBounds(shifted, heights);
  }

  return result;
}

let nodeCounter = Date.now();
export function generateNodeId(): string {
  return `node-${++nodeCounter}`;
}

/** 自動レイアウト: 親ノードの周囲に子ノードを配置する */
export function autoLayoutChildren(
  parentNode: RFNode,
  existingChildCount: number,
  direction: 'right' | 'left' = 'right'
): { x: number; y: number } {
  const spacing = 220;
  const verticalSpacing = 80;
  const col = Math.floor(existingChildCount / 5);
  const row = existingChildCount % 5;
  const xOffset = direction === 'left'
    ? -spacing * (col + 1)
    : spacing * (col + 1);
  return {
    x: parentNode.position.x + xOffset,
    y: parentNode.position.y + verticalSpacing * row - verticalSpacing * 2,
  };
}
