import type { ElkNode } from 'elkjs';

export type ElkLayoutRunOptions = Readonly<{
  layoutOptions?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

/** Capability exposed to layout strategies without transferring lifecycle ownership. */
export interface ElkLayoutRunner {
  run: (graph: ElkNode, options?: ElkLayoutRunOptions) => Promise<ElkNode>;
}

/** Canvas-owned reusable runner whose worker lifetime must be explicitly released. */
export interface ElkLayoutExecutor extends ElkLayoutRunner {
  dispose: () => void;
}
