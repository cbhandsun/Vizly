import { expect } from 'vitest';

import { createFilletedPath } from '../../../algorithms/smartEdgeUtils';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
  getDisplayTerminalValidationReport,
} from '../baseReactFlowTerminalAxisRepair';
import { createBaseReactFlowDisplayEdges } from '../baseReactFlowDisplayEdges';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import {
  displayRenderedHardQualityGatesAreClean,
  getDisplayHardQualityGateReport,
} from '../baseReactFlowDisplayQualityGates';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import {
  detachedDisplayEndpoints,
  edgeNodeObstacleHits,
  edgeOverlapProblems,
  parseRenderedStraightPath,
  rectForObstacleNode,
  shortEndpointSegments,
  strictPathCrossings,
  tinyInteriorSegments,
  tinyRenderedSegments,
  withAbsoluteNodePositions,
} from './baseReactFlowDisplayEdges.testUtils';

export const assertBaseReactFlowDisplayQualityGates = async (dataset: unknown) => {
  const canvas = await standardDataToCanvas(dataset as any);
  const result = createBaseReactFlowDisplayEdges({
    edges: canvas.edges,
    nodes: canvas.nodes,
    enableSmartEdges: true,
    smartEdgePadding: 20,
    isLargeGraph: false,
    displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({
      edges: canvas.edges,
      nodes: canvas.nodes,
    }),
  });
  const quality = calculateEdgePathQualityScore(result);
  const absoluteNodes = withAbsoluteNodePositions(canvas.nodes as any);
  const terminalValidationSnapshot = createDisplayTerminalValidationSnapshot(absoluteNodes);
  const nodeObstacleHits = edgeNodeObstacleHits(result, absoluteNodes);
  const hardGateObstacleHits = countDisplayObstacleHits(result, absoluteNodes);
  const renderedHardReport = getDisplayHardQualityGateReport(result, absoluteNodes, 'polished');
  const computedPaths = result.map(edge => ({
    id: edge.id,
    path: ((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>,
  }));
  const computedStrictCrossings = strictPathCrossings(computedPaths);
  const crossingEdgeIds = new Set(computedStrictCrossings.flatMap((crossing) => {
    const item = crossing as { edgeA: string; edgeB: string };
    return [item.edgeA, item.edgeB];
  }));
  const crossingEdges = result
    .filter(edge => crossingEdgeIds.has(edge.id))
    .map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      sourcePortPolicy: (edge.data as any)?.sourcePortPolicy,
      targetPortPolicy: (edge.data as any)?.targetPortPolicy,
      path: (edge.data as any)?.computedPath,
    }));

  expect(
    quality.nonOrthogonalSegments,
    JSON.stringify({ name: (dataset as any).name, quality, computedPaths }, null, 2),
  ).toBe(0);
  expect(
    computedStrictCrossings,
    JSON.stringify({
      name: (dataset as any).name,
      hardGateObstacleHits,
      quality,
      computedStrictCrossings,
      crossingEdges,
      computedPaths,
    }, null, 2),
  ).toEqual([]);
  expect(
    quality.strictCrossings,
    JSON.stringify({
      name: (dataset as any).name,
      quality,
      strictCrossings: computedStrictCrossings,
      computedPaths,
    }, null, 2),
  ).toBe(0);
  expect(
    nodeObstacleHits,
    JSON.stringify({
      name: (dataset as any).name,
      hardGateObstacleHits,
      nodeObstacleHits,
      affectedPaths: computedPaths.filter(path => (
        nodeObstacleHits.some(hit => hit.edgeId === path.id)
      )),
    }, null, 2),
  ).toEqual([]);
  expect(
    displayEdgesHaveNodeAttachedTerminals(result, absoluteNodes),
    JSON.stringify({
      name: (dataset as any).name,
      detachedEndpoints: detachedDisplayEndpoints(result, absoluteNodes),
    }, null, 2),
  ).toBe(true);
  expect(
    displayEdgesHaveNodeAnchoredTerminals(result, absoluteNodes),
    JSON.stringify({
      name: (dataset as any).name,
      detachedEndpoints: detachedDisplayEndpoints(result, absoluteNodes),
      terminalReport: getDisplayTerminalValidationReport(result, terminalValidationSnapshot),
      unanchoredEdges: getDisplayTerminalValidationReport(result, terminalValidationSnapshot)
        .unanchoredEdgeIndexes.map(index => ({
          id: result[index]?.id,
          sourceHandle: result[index]?.sourceHandle,
          targetHandle: result[index]?.targetHandle,
          path: (result[index]?.data as any)?.computedPath,
        })),
    }, null, 2),
  ).toBe(true);
  expect(
    displayRenderedHardQualityGatesAreClean(result, absoluteNodes),
    JSON.stringify({ name: (dataset as any).name, renderedHardReport }, null, 2),
  ).toBe(true);
  const overlapProblems = edgeOverlapProblems(result);
  expect(
    quality.reverseOverlap,
    JSON.stringify({
      name: (dataset as any).name,
      quality,
      overlapProblems,
    }, null, 2),
  ).toBe(0);
  expect(
    quality.unrelatedOverlap,
    JSON.stringify({ name: (dataset as any).name, quality, overlapProblems }, null, 2),
  ).toBe(0);
  expect(
    quality.unexplainedRelatedOverlap,
    JSON.stringify({ name: (dataset as any).name, quality, overlapProblems }, null, 2),
  ).toBe(0);
  expect(
    quality.shortEndpointStubs,
    JSON.stringify({
      name: (dataset as any).name,
      quality,
      shortEndpointStubs: result
        .map(edge => ({
          id: edge.id,
          path: (edge.data as any).computedPath,
          short: shortEndpointSegments(((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>),
        }))
        .filter(item => item.short.length > 0),
    }, null, 2),
  ).toBe(0);
  expect(
    quality.tinyInteriorDoglegs,
    JSON.stringify({
      name: (dataset as any).name,
      quality,
      tinyDoglegs: quality.tinyInteriorDoglegs > 0 ? result
        .map((edge, edgeIndex) => {
          const path = ((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>;
          const tiny = tinyInteriorSegments(path);
          const alternatives = path.length === 4
            ? [
              [
                { x: path[0].x, y: path[0].y },
                { x: path[0].x, y: path[3].y },
              ],
              [
                { x: path[3].x, y: path[0].y },
                { x: path[3].x, y: path[3].y },
              ],
              [
                { x: path[0].x, y: path[0].y },
                { x: path[3].x, y: path[0].y },
              ],
              [
                { x: path[0].x, y: path[3].y },
                { x: path[3].x, y: path[3].y },
              ],
              [
                { x: path[0].x, y: path[2].y - Math.sign(path[2].y - path[1].y) * 48 },
                { x: path[1].x, y: path[2].y - Math.sign(path[2].y - path[1].y) * 48 },
                { x: path[2].x, y: path[2].y },
                { x: path[3].x, y: path[3].y },
              ],
              [
                { x: path[0].x, y: path[0].y },
                { x: path[1].x, y: path[1].y },
                { x: path[2].x, y: path[1].y + Math.sign(path[2].y - path[1].y) * 48 },
                { x: path[3].x, y: path[1].y + Math.sign(path[2].y - path[1].y) * 48 },
              ],
            ].map(candidatePath => ({
              path: candidatePath,
              quality: calculateEdgePathQualityScore(result.map((candidateEdge, candidateIndex) => (
                candidateIndex === edgeIndex
                  ? { ...candidateEdge, data: { ...(candidateEdge.data || {}), computedPath: candidatePath } }
                  : candidateEdge
              ))),
            }))
            : [];
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            path,
            tiny,
            terminalNodes: absoluteNodes
              .filter(nodeItem => nodeItem.id === edge.source || nodeItem.id === edge.target)
              .map(nodeItem => ({
                id: nodeItem.id,
                rect: rectForObstacleNode(nodeItem),
              })),
            alternatives,
          };
        })
        .filter(item => item.tiny.length > 0) : [],
    }, null, 2),
  ).toBe(0);
  expect(
    quality.hairpins,
    JSON.stringify({
      name: (dataset as any).name,
      quality,
      hairpinPaths: result
        .map(edge => ({
          id: edge.id,
          path: (edge.data as any).computedPath,
          hairpins: calculateEdgePathQualityScore([edge]).hairpins,
        }))
        .filter(item => item.hairpins > 0),
    }, null, 2),
  ).toBe(0);

  const renderedPaths = result.map((edge) => ({
    id: edge.id,
    path: parseRenderedStraightPath(
      createFilletedPath(((edge.data as any).computedPath || []) as Array<{ x: number; y: number }>, 8),
    ),
  }));
  const renderedEdges = result.map((edge, index) => ({
    ...edge,
    data: {
      ...(edge.data || {}),
      computedPath: renderedPaths[index]?.path ?? [],
    },
  }));
  expect(
    strictPathCrossings(renderedPaths),
    JSON.stringify({ name: (dataset as any).name, renderedPaths }, null, 2),
  ).toEqual([]);
  expect(
    edgeNodeObstacleHits(renderedEdges, absoluteNodes),
    JSON.stringify({ name: (dataset as any).name, renderedPaths }, null, 2),
  ).toEqual([]);
  expect(
    displayEdgesHaveNodeAnchoredTerminals(renderedEdges, absoluteNodes, {
      allowRenderedFilletTransitions: true,
    }),
    JSON.stringify({
      name: (dataset as any).name,
      unanchored: renderedEdges
        .filter(edge => !displayEdgesHaveNodeAnchoredTerminals([edge], absoluteNodes))
        .map(edge => ({
          id: edge.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          path: (edge.data as any)?.computedPath,
          rawPath: (result.find(resultEdge => resultEdge.id === edge.id)?.data as any)?.computedPath,
          terminalNodes: absoluteNodes
            .filter(node => node.id === edge.source || node.id === edge.target)
            .map(node => ({ id: node.id, rect: rectForObstacleNode(node) })),
        })),
    }, null, 2),
  ).toBe(true);
  const renderedShortEndpointStubs = renderedPaths
    .map(({ id, path }) => ({ id, path, short: shortEndpointSegments(path) }))
    .filter(item => item.short.length > 0);
  expect(
    renderedShortEndpointStubs,
    JSON.stringify({ name: (dataset as any).name, renderedShortEndpointStubs }, null, 2),
  ).toEqual([]);
  const renderedTinySegments = renderedPaths
    .map(({ id, path }) => ({ id, path, tiny: tinyRenderedSegments(path) }))
    .filter(item => item.tiny.length > 0);
  expect(
    renderedTinySegments,
    JSON.stringify({ name: (dataset as any).name, renderedTinySegments }, null, 2),
  ).toEqual([]);
};
