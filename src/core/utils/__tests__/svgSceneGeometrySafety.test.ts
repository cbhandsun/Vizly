import { describe, expect, it } from 'vitest';
import type { DiagramRenderScene } from '../../rendering/types';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';
import { hasSafeSvgSceneGeometry } from '../../export/svgSceneGeometrySafety';

const buildScene = (): DiagramRenderScene => buildRenderSceneFromReactFlow(
  [
    {
      id: 'a',
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 60 },
      data: { label: 'A' },
    } as any,
    {
      id: 'b',
      position: { x: 180, y: 0 },
      measured: { width: 100, height: 60 },
      data: { label: 'B' },
    } as any,
  ],
  [
    {
      id: 'a-b',
      source: 'a',
      target: 'b',
      label: 'edge',
    } as any,
  ],
);

describe('svgSceneGeometrySafety', () => {
  it('accepts normalized render scenes from the React Flow adapter', () => {
    expect(hasSafeSvgSceneGeometry(buildScene())).toBe(true);
  });

  it('rejects invalid bounds', () => {
    const scene = buildScene();

    expect(hasSafeSvgSceneGeometry({ ...scene, bounds: { ...scene.bounds, width: Number.NaN } })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, bounds: { ...scene.bounds, height: 0 } })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, bounds: { ...scene.bounds, maxX: Number.POSITIVE_INFINITY } })).toBe(false);
  });

  it('rejects invalid node geometry', () => {
    const scene = buildScene();

    expect(hasSafeSvgSceneGeometry({ ...scene, nodes: [{ ...scene.nodes[0], width: -1 }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, nodes: [{ ...scene.nodes[0], fontSize: 0 }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, nodes: [{ ...scene.nodes[0], borderRadius: -1 }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, nodes: [{ ...scene.nodes[0], x: Number.NEGATIVE_INFINITY }] })).toBe(false);
  });

  it('rejects invalid edge geometry', () => {
    const scene = buildScene();

    expect(hasSafeSvgSceneGeometry({ ...scene, edges: [{ ...scene.edges[0], points: [] }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, edges: [{ ...scene.edges[0], points: [{ x: 0, y: Number.NaN }] }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, edges: [{ ...scene.edges[0], strokeWidth: 0 }] })).toBe(false);
    expect(hasSafeSvgSceneGeometry({ ...scene, edges: [{ ...scene.edges[0], opacity: 2 }] })).toBe(false);
  });
});
