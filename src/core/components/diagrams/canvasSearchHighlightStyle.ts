import type { Edge, Node } from '@xyflow/react';

import {
    buildPresentationEdgeIdSelector,
    buildPresentationNodeSelector,
} from '../presentation/presentationSelectorSafety';
import {
    buildFlowchartCanvasSearchMatchKey,
    type FlowchartCanvasSearchMatch,
} from './flowchartSearchReplace';

interface CanvasSearchHighlightStyleInput {
    currentMatch: FlowchartCanvasSearchMatch | null;
    currentMatchKey: string | null;
    edges: readonly Edge[];
    matches: readonly FlowchartCanvasSearchMatch[];
    nodes: readonly Node[];
    query: string;
}

export const buildCanvasSearchHighlightStyle = ({
    currentMatch,
    currentMatchKey,
    edges,
    matches,
    nodes,
    query,
}: CanvasSearchHighlightStyleInput): string => {
    if (!query.trim() || matches.length === 0) return '';

    const currentNodeStyles = currentMatch?.kind === 'node'
        ? `${buildPresentationNodeSelector(currentMatch.id)} {
            outline: 3px solid rgba(59, 130, 246, 0.8) !important;
            outline-offset: 4px !important;
            border-radius: 8px;
            animation: search-pulse 1.5s ease-in-out infinite !important;
            z-index: 1000 !important;
        }`
        : '';
    const currentEdgeStyles = currentMatch?.kind === 'edge'
        ? `${buildPresentationEdgeIdSelector(currentMatch.id)} .react-flow__edge-path {
            stroke: rgba(37, 99, 235, 1) !important;
            stroke-width: 4px !important;
            filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.65));
            animation: search-edge-pulse 1.5s ease-in-out infinite !important;
        }`
        : '';
    const otherNodeSelectors = matches
        .filter(match => match.kind === 'node' && buildFlowchartCanvasSearchMatchKey(match) !== currentMatchKey)
        .map(match => buildPresentationNodeSelector(match.id))
        .join(',\n');
    const otherEdgeSelectors = matches
        .filter(match => match.kind === 'edge' && buildFlowchartCanvasSearchMatchKey(match) !== currentMatchKey)
        .map(match => `${buildPresentationEdgeIdSelector(match.id)} .react-flow__edge-path`)
        .join(',\n');
    const nodeMatchIds = new Set(matches.filter(match => match.kind === 'node').map(match => match.id));
    const edgeMatchIds = new Set(matches.filter(match => match.kind === 'edge').map(match => match.id));
    const dimNodeSelectors = nodeMatchIds.size > 0
        ? nodes.filter(node => !nodeMatchIds.has(node.id)).map(node => buildPresentationNodeSelector(node.id)).join(',\n')
        : '';
    const dimEdgeSelectors = edgeMatchIds.size > 0
        ? edges.filter(edge => !edgeMatchIds.has(edge.id)).map(edge => buildPresentationEdgeIdSelector(edge.id)).join(',\n')
        : '';

    return [
        `@keyframes search-pulse {
            0%, 100% { outline-color: rgba(59, 130, 246, 0.8); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            50% { outline-color: rgba(59, 130, 246, 1); box-shadow: 0 0 16px 4px rgba(59, 130, 246, 0.25); }
        }
        @keyframes search-edge-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.45)); }
            50% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.9)); }
        }`,
        currentNodeStyles,
        currentEdgeStyles,
        otherNodeSelectors ? `${otherNodeSelectors} {
            outline: 2px solid rgba(59, 130, 246, 0.35) !important;
            outline-offset: 3px !important;
            border-radius: 8px;
        }` : '',
        otherEdgeSelectors ? `${otherEdgeSelectors} {
            stroke: rgba(59, 130, 246, 0.72) !important;
            stroke-width: 3px !important;
        }` : '',
        dimNodeSelectors ? `${dimNodeSelectors} { opacity: 0.35 !important; transition: opacity 0.3s ease !important; }` : '',
        dimEdgeSelectors ? `${dimEdgeSelectors} { opacity: 0.22 !important; transition: opacity 0.3s ease !important; }` : '',
        `@media (prefers-reduced-motion: reduce) {
            .react-flow__node,
            .react-flow__edge-path {
                animation: none !important;
                transition: none !important;
            }
        }`,
    ].filter(Boolean).join('\n');
};
