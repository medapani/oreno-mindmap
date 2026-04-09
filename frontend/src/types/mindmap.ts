// マインドマップのGoデータモデルに対応するTypeScript型定義

export interface MindMapNode {
  id: string;
  label: string;
  textAlign?: 'left' | 'center' | 'right';
  color: string;
  image?: string; // Base64エンコード画像
  children?: MindMapNode[];
  x: number;
  y: number;
  collapsed?: boolean;
  direction?: 'right' | 'left';
  width?: number; // ユーザーが手動設定したノード幅
}

export interface Sheet {
  id: string;
  name: string;
  roots: MindMapNode[];
}

export interface MindMap {
  version: string;
  created_at: string;
  updated_at: string;
  sheets: Sheet[];
  active_sheet_id: string;
}

export interface ImportResult {
  file_name: string;
  sheets: Sheet[];
}

// React Flow用フラット形式
export interface FlowNode {
  id: string;
  type: 'mindmapNode';
  position: { x: number; y: number };
  data: {
    label: string;
    textAlign?: 'left' | 'center' | 'right';
    color: string;
    image?: string;
    collapsed?: boolean;
    isRoot?: boolean;
    direction?: 'right' | 'left';
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  style?: React.CSSProperties;
}

export const NODE_COLORS = [
  '#F87171', // red
  '#FB923C', // orange
  '#FBBF24', // amber
  '#4ADE80', // green
  '#34D399', // emerald
  '#22D3EE', // cyan
  '#60A5FA', // blue
  '#A78BFA', // violet
  '#F472B6', // pink
  '#94A3B8', // slate
] as const;

export type NodeColor = typeof NODE_COLORS[number];
