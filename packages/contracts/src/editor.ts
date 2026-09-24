import type { VizlyDocument, VizlyDocumentNode } from './document.js';

export type VizlyEditorCommand =
  | { type: 'add-node'; node: VizlyDocumentNode }
  | { type: 'remove-nodes'; nodeIds: string[] };

export type VizlyEditorEvent =
  | { type: 'ready'; editorId: string }
  | { type: 'document-change'; document: VizlyDocument }
  | { type: 'error'; code: string };

export interface VizlyEditorHandle {
  loadDocument: (document: unknown) => Promise<void>;
  exportDocument: () => Promise<VizlyDocument>;
  execute: (command: VizlyEditorCommand) => Promise<void>;
  dispose: () => void;
}

export interface VizlyLogger {
  error: (code: string) => void;
  warn?: (code: string) => void;
}

export interface VizlyEditorHostServices {
  logger?: VizlyLogger;
}
