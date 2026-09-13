import type { Edge, Node } from '@xyflow/react';
import { applyLayoutFixedNodeConstraints } from './layoutStrategyInputBoundary';
import { resolveLayoutStrategyGeometryConstraints } from './layoutStrategyGeometryConstraints';
import { mergeScopedLayoutResult, type LayoutScopeResolution } from './layoutScopeBoundary';
import type { LayoutRoutingTransactionDiagnostics } from './layoutRoutingTransactionDiagnostics';
import type { LayoutRoutingTransactionRequest } from './useLayoutRoutingTransaction';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';

export type LayoutStrategyCommitAttemptInput = Readonly<{
    request: LayoutRoutingTransactionRequest;
    layoutScope: LayoutScopeResolution;
    allNodes: Node[];
    allEdges: Edge[];
    appliedStrategyName: string;
    appliedDirection: FlowchartLayoutDirection;
    appliedLaneDomainOrder?: readonly string[];
    transactionDiagnostics: LayoutRoutingTransactionDiagnostics;
    commitLayout: (request: LayoutRoutingTransactionRequest) => Promise<void>;
    commitSelection: () => void;
}>;

export const commitLayoutStrategyAttempt = async ({
    request,
    layoutScope,
    allNodes,
    allEdges,
    appliedStrategyName,
    appliedDirection,
    appliedLaneDomainOrder,
    transactionDiagnostics,
    commitLayout,
    commitSelection,
}: LayoutStrategyCommitAttemptInput): Promise<void> => {
    transactionDiagnostics.finishPhase('layout-calculation');
    transactionDiagnostics.beginAttempt();
    const scopedRequest = layoutScope.status === 'scoped'
        ? {
            ...request,
            ...mergeScopedLayoutResult({
                allNodes,
                allEdges,
                scope: layoutScope,
                candidateNodes: request.nodes,
                candidateEdges: request.edges,
            }),
            alternative: undefined,
        }
        : request;
    const layoutConstraints = resolveLayoutStrategyGeometryConstraints(
        appliedStrategyName,
        appliedDirection,
        scopedRequest.nodes,
        appliedLaneDomainOrder,
        allNodes,
    );
    const constrainedNodes = applyLayoutFixedNodeConstraints(
        scopedRequest.nodes,
        allNodes,
        layoutConstraints,
    );
    await commitLayout({
        ...scopedRequest,
        nodes: constrainedNodes,
        diagnostics: transactionDiagnostics,
        layoutConstraints,
        commitSelection,
    });
};
