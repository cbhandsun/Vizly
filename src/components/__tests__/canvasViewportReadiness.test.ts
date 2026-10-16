// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveCanvasViewportReadiness } from '../canvasViewportReadiness';

const readyBridge = { isCanvasReady: () => true };
const node = { measured: { width: 120, height: 80 } };
describe('canvas viewport command readiness', () => {
  it('accepts actual measured and explicit geometry for live and static canvases', () => {
    expect(resolveCanvasViewportReadiness({ nodes: [node] }, readyBridge)).toBe('ready');
    expect(resolveCanvasViewportReadiness({ nodes: [{ width: 120, height: 80 }] }, null)).toBe('ready');
  });
  it('does not confuse a connected transport or loaded bridge with rendered nodes', () => {
    expect(resolveCanvasViewportReadiness({ nodes: [] }, null)).toBe('waiting');
    expect(resolveCanvasViewportReadiness({ nodes: [node] }, { isCanvasReady: () => false })).toBe('waiting');
    expect(resolveCanvasViewportReadiness({ nodes: [{ id: 'loading' }] }, readyBridge)).toBe('waiting');
  });
  it('disables commands for a loaded empty or entirely hidden canvas', () => {
    expect(resolveCanvasViewportReadiness({ nodes: [] }, readyBridge)).toBe('empty');
    expect(resolveCanvasViewportReadiness({ nodes: [{ hidden: true }] }, readyBridge)).toBe('empty');
    expect(resolveCanvasViewportReadiness({ nodes: [node, { hidden: true }] }, readyBridge)).toBe('ready');
  });
  it.each([null, undefined, [], {}, { nodes: null }, { nodes: [null] }, { nodes: [{ hidden: 'true' }] },
    { nodes: [{ width: 0, height: 10 }] }, { nodes: [{ width: NaN, height: 10 }] },
    { nodes: [{ width: Infinity, height: 10 }] }, { nodes: [{ width: 1e100, height: 10 }] },
    { nodes: [{ width: 10, height: -1 }] }, { nodes: [{ width: '100', height: 10 }] },
  ])('keeps malformed or extreme geometry unavailable', snapshot => {
    expect(resolveCanvasViewportReadiness(snapshot, readyBridge)).toBe('waiting');
  });
  it('fails closed for unsafe getters and invalid readiness functions', () => {
    const unsafe = Object.defineProperty({}, 'nodes', { get: () => { throw new Error('private input'); } });
    expect(resolveCanvasViewportReadiness(unsafe, readyBridge)).toBe('waiting');
    expect(resolveCanvasViewportReadiness({ nodes: [node] }, { isCanvasReady: 'yes' })).toBe('waiting');
    expect(resolveCanvasViewportReadiness({ nodes: [node] }, { isCanvasReady: () => { throw new Error('private state'); } })).toBe('waiting');
  });
});
