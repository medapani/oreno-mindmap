/**
 * Wailsバインディングのラッパー
 * Web化する際はこのファイルを httpClient.ts に差し替えるだけでOK
 */

import { MindMap, ImportResult } from '../types/mindmap';

// Wailsランタイムのバインディング（wails devで自動生成される）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

const go = () => window.go?.main?.App;

export const wailsClient = {
  newFile: async (): Promise<MindMap> => {
    return go().NewFile();
  },

  openFile: async (): Promise<MindMap | null> => {
    return go().OpenFile();
  },

  saveFile: async (mm: MindMap): Promise<string> => {
    return go().SaveFile(mm);
  },

  saveAsFile: async (mm: MindMap): Promise<string> => {
    return go().SaveAsFile(mm);
  },

  exportMarkdown: async (mm: MindMap): Promise<void> => {
    return go().ExportMarkdown(mm);
  },

  exportSvg: async (svgContent: string): Promise<void> => {
    return go().ExportSVG(svgContent);
  },

  getCurrentFilePath: async (): Promise<string> => {
    return go().GetCurrentFilePath();
  },

  loadImageFile: async (): Promise<string | null> => {
    return go().LoadImageFile();
  },

  getClipboardImage: async (): Promise<string> => {
    return go().GetClipboardImage();
  },

  importFile: async (): Promise<ImportResult | null> => {
    return go().ImportFile();
  },

  getPendingFile: async (): Promise<string> => {
    return go().GetPendingFile();
  },

  setFrontendReady: async (): Promise<void> => {
    return go().SetFrontendReady();
  },

  openFileByPath: async (path: string): Promise<MindMap | null> => {
    return go().OpenFileByPath(path);
  },
};
