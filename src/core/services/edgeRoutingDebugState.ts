import type { PathFindingJob, PathFindingResult } from '../types/routing';
import type { RoutingBatchRequest } from './edgeRoutingBatchLifecycle';
import { buildRoutingDebugPayload } from './edgeRoutingBatchLifecycle';

export interface RoutingTrunkDebugData {
  edgeId: string;
  edgeType?: string;
  delta: number;
  dirSign: number;
  side: number;
  typeInfluenced: boolean;
  trunk?: {
    direction: 'horizontal' | 'vertical';
    axis: number;
    range: { min: number; max: number };
    port?: string;
  };
}

type DebugDataListener = (data: unknown) => void;
type DebugSelectionListener = (edgeId: string | null) => void;

type DebugNode = {
  id?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  position?: { x?: unknown; y?: unknown };
  positionAbsolute?: { x?: unknown; y?: unknown };
  measured?: { width?: unknown; height?: unknown };
};

const finiteOr = (values: unknown[], fallback: number): number => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
};

const finiteSizeOr = (values: unknown[], fallback: number): number => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000) {
      return value;
    }
  }
  return fallback;
};

const updateEndpoint = (
  node: DebugNode | undefined,
  job: RoutingBatchRequest['job'],
  endpoint: 'source' | 'target',
): void => {
  if (!node) return;
  const xKey = endpoint === 'source' ? 'sourceX' : 'targetX';
  const yKey = endpoint === 'source' ? 'sourceY' : 'targetY';
  const x = finiteOr(
    [node.positionAbsolute?.x, node.position?.x, node.x],
    finiteOr([job[xKey]], 0),
  );
  const y = finiteOr(
    [node.positionAbsolute?.y, node.position?.y, node.y],
    finiteOr([job[yKey]], 0),
  );
  const width = finiteSizeOr([node.measured?.width, node.width], 150);
  const height = finiteSizeOr([node.measured?.height, node.height], 80);
  job[xKey] = finiteOr([x + width / 2], x);
  job[yKey] = finiteOr([y + height / 2], y);
};

/** Refreshes debug reroute coordinates from a validated view of the graph nodes. */
export const refreshDebugRoutingRequestEndpoints = (request: RoutingBatchRequest): void => {
  const nodes = Array.isArray(request.graph?.nodes) ? request.graph.nodes : [];
  const nodeById = new Map<string, DebugNode>();
  for (const rawNode of nodes) {
    const node = rawNode as DebugNode | null;
    if (node && typeof node.id === 'string' && node.id.length > 0) {
      nodeById.set(node.id, node);
    }
  }
  updateEndpoint(nodeById.get(request.job.source), request.job, 'source');
  updateEndpoint(nodeById.get(request.job.target), request.job, 'target');
};

/** Owns optional developer-tool state without coupling it to routing orchestration. */
export class EdgeRoutingDebugState {
  private selectedEdgeId: string | null = null;
  private dataListener: DebugDataListener | null = null;
  private selectionListener: DebugSelectionListener | null = null;
  private trunkData = new Map<string, RoutingTrunkDebugData>();

  public constructor(private readonly onListenerError?: (error: unknown) => void) {}

  public getSelectedEdgeId(): string | null {
    return this.selectedEdgeId;
  }

  public selectEdge(edgeId: string | null): void {
    this.selectedEdgeId = typeof edgeId === 'string' && edgeId.length > 0 ? edgeId : null;
    this.invokeListener(this.selectionListener, this.selectedEdgeId);
  }

  public registerDataListener(listener: DebugDataListener | null): void {
    this.dataListener = typeof listener === 'function' ? listener : null;
  }

  public registerSelectionListener(listener: DebugSelectionListener | null): void {
    this.selectionListener = typeof listener === 'function' ? listener : null;
  }

  public prepareJob(job: PathFindingJob): void {
    if (this.selectedEdgeId === job.edgeId) job.debug = true;
  }

  public recordClassification(edge: { id: string; type?: string }, delta: number): void {
    if (!edge.id) return;
    this.trunkData.set(edge.id, {
      edgeId: edge.id,
      edgeType: edge.type,
      delta: Number.isFinite(delta) ? delta : 0,
      dirSign: 0,
      side: 0,
      typeInfluenced: false,
    });
  }

  public recordTrunk(
    edgeIds: readonly string[],
    trunk: RoutingTrunkDebugData['trunk'],
  ): void {
    if (
      !trunk
      || (trunk.direction !== 'horizontal' && trunk.direction !== 'vertical')
      || !Number.isFinite(trunk.axis)
      || !Number.isFinite(trunk.range?.min)
      || !Number.isFinite(trunk.range?.max)
    ) return;
    const safeTrunk: NonNullable<RoutingTrunkDebugData['trunk']> = {
      direction: trunk.direction,
      axis: trunk.axis,
      range: { min: trunk.range.min, max: trunk.range.max },
      ...(typeof trunk.port === 'string' ? { port: trunk.port.slice(0, 128) } : {}),
    };
    for (const edgeId of edgeIds) {
      const entry = this.trunkData.get(edgeId);
      if (entry) entry.trunk = safeTrunk;
    }
  }

  public emitResult(
    edgeId: string,
    result: PathFindingResult,
    job: Partial<PathFindingJob> | undefined,
    graphDebug: boolean | undefined,
  ): void {
    if (!this.dataListener || !(this.selectedEdgeId === edgeId || job?.debug || graphDebug)) return;
    this.invokeListener(
      this.dataListener,
      this.buildPayload(edgeId, result, job),
    );
  }

  public buildPayload(
    edgeId: string,
    result: PathFindingResult,
    job: Partial<PathFindingJob> | undefined,
  ): Record<string, unknown> {
    return buildRoutingDebugPayload(edgeId, result, this.trunkData.get(edgeId), job);
  }

  private invokeListener<T>(listener: ((value: T) => void) | null, value: T): void {
    if (!listener) return;
    try {
      listener(value);
    } catch (error) {
      try {
        this.onListenerError?.(error);
      } catch {
        // Debug diagnostics must not break the routing pipeline.
      }
    }
  }
}
