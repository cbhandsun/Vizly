import type { Edge } from '@xyflow/react';

import {
  detectChangedEdgeRoutingNodes,
  type EdgeRoutingSnapshotNode,
} from './edgeRoutingNodeChangeDetection';

export interface EdgeInitializationResult {
  affectedNodeIds: string[];
  hadExistingEdges: boolean;
}

type GraphVersionSubscriber = () => void;

const hasRoutingIdentity = (edge: Edge): boolean =>
  typeof edge?.id === 'string'
  && edge.id.length > 0
  && typeof edge.source === 'string'
  && edge.source.length > 0
  && typeof edge.target === 'string'
  && edge.target.length > 0;

/**
 * Owns topology-derived state used by incremental edge routing.
 *
 * The coordinator remains responsible for cache and worker side effects. This
 * object only tracks graph versioning, topology indexes, dirty edges, and node
 * position snapshots so those rules can be tested without worker setup.
 */
export class EdgeRoutingIncrementalState {
  private edges: Edge[] = [];
  private edgesById = new Map<string, Edge>();
  private nodeToEdgeIds = new Map<string, Set<string>>();
  private sourceToEdgeIds = new Map<string, Set<string>>();
  private targetToEdgeIds = new Map<string, Set<string>>();
  private dirtyEdgeIds = new Set<string>();
  private nodePositionSnapshot = new Map<string, { x: number; y: number }>();
  private graphVersion = 0;
  private graphVersionSubscribers = new Set<GraphVersionSubscriber>();

  public constructor(private readonly onSubscriberError?: (error: unknown) => void) {}

  public getGraphVersion(): number {
    return this.graphVersion;
  }

  public incrementGraphVersion(): number {
    this.graphVersion += 1;
    for (const subscriber of [...this.graphVersionSubscribers]) {
      try {
        subscriber();
      } catch (error) {
        try {
          this.onSubscriberError?.(error);
        } catch {
          // Diagnostics must never prevent the remaining subscribers from running.
        }
      }
    }
    return this.graphVersion;
  }

  public subscribeGraphVersion(subscriber: GraphVersionSubscriber): () => void {
    this.graphVersionSubscribers.add(subscriber);
    return () => {
      this.graphVersionSubscribers.delete(subscriber);
    };
  }

  public initializeEdges(edges: readonly Edge[]): EdgeInitializationResult {
    const nextById = new Map<string, Edge>();
    for (const edge of edges) {
      if (hasRoutingIdentity(edge)) nextById.set(edge.id, edge);
    }

    const affectedNodeIds = new Set<string>();
    for (const [edgeId, previous] of this.edgesById) {
      const next = nextById.get(edgeId);
      if (!next || next.source !== previous.source || next.target !== previous.target) {
        affectedNodeIds.add(previous.source);
        affectedNodeIds.add(previous.target);
      }
    }
    for (const [edgeId, next] of nextById) {
      const previous = this.edgesById.get(edgeId);
      if (!previous || next.source !== previous.source || next.target !== previous.target) {
        affectedNodeIds.add(next.source);
        affectedNodeIds.add(next.target);
      }
    }

    const hadExistingEdges = this.edgesById.size > 0;
    this.replaceEdges([...nextById.values()]);
    return { affectedNodeIds: [...affectedNodeIds], hadExistingEdges };
  }

  public replaceEdges(edges: readonly Edge[]): void {
    this.edges = [...edges];
    this.edgesById = new Map(edges.map(edge => [edge.id, edge]));
    this.nodeToEdgeIds.clear();
    this.sourceToEdgeIds.clear();
    this.targetToEdgeIds.clear();

    for (const edge of edges) {
      this.addToIndex(this.nodeToEdgeIds, edge.source, edge.id);
      this.addToIndex(this.nodeToEdgeIds, edge.target, edge.id);
      this.addToIndex(this.sourceToEdgeIds, edge.source, edge.id);
      this.addToIndex(this.targetToEdgeIds, edge.target, edge.id);
    }

    for (const edgeId of [...this.dirtyEdgeIds]) {
      if (!this.edgesById.has(edgeId)) this.dirtyEdgeIds.delete(edgeId);
    }
  }

  public getEdges(): readonly Edge[] {
    return this.edges;
  }

  public hasDependencies(): boolean {
    return this.nodeToEdgeIds.size > 0;
  }

  public getAffectedEdgeIds(nodeIds: readonly string[]): string[] {
    const affected = new Set<string>();
    for (const nodeId of nodeIds) {
      for (const edgeId of this.nodeToEdgeIds.get(nodeId) ?? []) affected.add(edgeId);
    }
    return [...affected];
  }

  public markNodesChanged(nodeIds: readonly string[] | string): void {
    const ids = typeof nodeIds === 'string' ? [nodeIds] : nodeIds;
    for (const edgeId of this.getAffectedEdgeIds(ids)) {
      this.dirtyEdgeIds.add(edgeId);
      const edge = this.edgesById.get(edgeId);
      if (!edge) continue;
      for (const siblingId of this.sourceToEdgeIds.get(edge.source) ?? []) {
        this.dirtyEdgeIds.add(siblingId);
      }
      for (const siblingId of this.targetToEdgeIds.get(edge.target) ?? []) {
        this.dirtyEdgeIds.add(siblingId);
      }
    }
  }

  public markDirty(edgeIds: string | Iterable<string>): void {
    if (typeof edgeIds === 'string') {
      if (edgeIds.length > 0) this.dirtyEdgeIds.add(edgeIds);
      return;
    }
    for (const edgeId of edgeIds) {
      if (typeof edgeId === 'string' && edgeId.length > 0) this.dirtyEdgeIds.add(edgeId);
    }
  }

  public markAllDirty(additionalEdgeIds: Iterable<string> = []): void {
    this.markDirty(this.edgesById.keys());
    this.markDirty(additionalEdgeIds);
  }

  public getDirtyEdgeIds(): string[] {
    return [...this.dirtyEdgeIds];
  }

  public isDirty(edgeId: string): boolean {
    return this.dirtyEdgeIds.has(edgeId);
  }

  public clearDirtyEdge(edgeId: string): void {
    this.dirtyEdgeIds.delete(edgeId);
  }

  public clearDirtyEdges(): void {
    this.dirtyEdgeIds.clear();
  }

  public hasDirtyEdges(): boolean {
    return this.dirtyEdgeIds.size > 0;
  }

  public getStats(): { total: number; dirty: number; ratio: number } {
    const total = this.edges.length;
    const dirty = this.dirtyEdgeIds.size;
    return { total, dirty, ratio: total > 0 ? Math.min(dirty, total) / total : 0 };
  }

  public detectChangedNodes(nodes: readonly EdgeRoutingSnapshotNode[]): string[] {
    return detectChangedEdgeRoutingNodes([...nodes], this.nodePositionSnapshot);
  }

  public resetDependencies(): void {
    this.nodeToEdgeIds.clear();
    this.sourceToEdgeIds.clear();
    this.targetToEdgeIds.clear();
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, edgeId: string): void {
    const values = index.get(key) ?? new Set<string>();
    values.add(edgeId);
    index.set(key, values);
  }
}
