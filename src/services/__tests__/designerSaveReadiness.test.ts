import { describe, expect, it } from 'vitest';
import { assertDesignerSaveReady, isDesignerSaveReady } from '../designerSaveReadiness';

describe('designer save readiness boundary', () => {
  it.each([null, undefined, [], 0, '', { isCanvasReady: false }, { isCanvasReady: () => false }, { isCanvasReady: () => 'true' }])('rejects unavailable or invalid readiness %j', value => {
    expect(isDesignerSaveReady(value)).toBe(false);
    expect(() => assertDesignerSaveReady(value)).toThrow('图表尚未加载完成');
  });
  it('allows successfully loaded empty documents and legacy static documents', () => {
    expect(isDesignerSaveReady({ nodes: [], isCanvasReady: () => true })).toBe(true);
    expect(isDesignerSaveReady({ nodes: [] })).toBe(true);
  });
  it('fails closed when readiness access or execution throws', () => {
    expect(isDesignerSaveReady({ get isCanvasReady() { throw new Error('controlled accessor failure'); } })).toBe(false);
    expect(isDesignerSaveReady({ isCanvasReady: () => { throw new Error('controlled readiness failure'); } })).toBe(false);
  });
  it('preserves the method receiver', () => {
    expect(isDesignerSaveReady({ ready: true, isCanvasReady(this: { ready: boolean }) { return this.ready; } })).toBe(true);
  });
});
