import type { DiagramRenderScene, RenderEdgeGeometry, RenderNodeGeometry } from '../rendering/types';

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const hasValidBounds = (scene: DiagramRenderScene): boolean => (
  isFiniteNumber(scene.bounds.minX)
  && isFiniteNumber(scene.bounds.minY)
  && isFiniteNumber(scene.bounds.maxX)
  && isFiniteNumber(scene.bounds.maxY)
  && isFiniteNumber(scene.bounds.width)
  && isFiniteNumber(scene.bounds.height)
  && scene.bounds.width > 0
  && scene.bounds.height > 0
);

const hasValidNodeGeometry = (node: RenderNodeGeometry): boolean => (
  isFiniteNumber(node.x)
  && isFiniteNumber(node.y)
  && isFiniteNumber(node.width)
  && isFiniteNumber(node.height)
  && isFiniteNumber(node.borderRadius)
  && isFiniteNumber(node.fontSize)
  && (typeof node.strokeWidth === 'undefined' || (isFiniteNumber(node.strokeWidth) && node.strokeWidth > 0))
  && node.width > 0
  && node.height > 0
  && node.borderRadius >= 0
  && node.fontSize > 0
);

const hasValidEdgeGeometry = (edge: RenderEdgeGeometry): boolean => (
  edge.points.length > 0
  && edge.points.every(point => isFiniteNumber(point.x) && isFiniteNumber(point.y))
  && isFiniteNumber(edge.strokeWidth)
  && isFiniteNumber(edge.opacity)
  && edge.strokeWidth > 0
  && edge.opacity >= 0
  && edge.opacity <= 1
);

export const hasSafeSvgSceneGeometry = (scene: DiagramRenderScene): boolean => (
  hasValidBounds(scene)
  && scene.nodes.every(hasValidNodeGeometry)
  && scene.edges.every(hasValidEdgeGeometry)
);
