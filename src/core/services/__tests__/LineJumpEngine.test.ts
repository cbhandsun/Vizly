import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectLineJumps, LineJumpEngine } from '../LineJumpEngine';

describe('LineJumpEngine', () => {
    let engine: LineJumpEngine;

    beforeEach(() => {
        LineJumpEngine.getInstance().cleanup();
        engine = LineJumpEngine.getInstance();
    });

    afterEach(() => {
        engine.cleanup();
    });

    it('draws a jump for a non-buddy vertical endpoint touching a horizontal sweep', () => {
        const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
        const vertical = [{ x: 80, y: 20 }, { x: 80, y: 100 }];

        engine.registerEdge('horizontal', horizontal, { source: 'a', target: 'b' });
        engine.registerEdge('vertical', vertical, { source: 'c', target: 'd' });

        const jumps = engine.getJumpsForEdge('horizontal');
        expect(jumps).toHaveLength(1);
        expect(jumps[0].point).toEqual({ x: 80, y: 100 });
        expect(injectLineJumps(horizontal, jumps)).toContain('A 6 6');
    });

    it('keeps O2M and M2O buddy endpoint contacts as shared junctions', () => {
        const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
        const vertical = [{ x: 80, y: 20 }, { x: 80, y: 100 }];

        engine.registerEdge('o2m-a', horizontal, { source: 'hub', target: 'a' });
        engine.registerEdge('o2m-b', vertical, { source: 'hub', target: 'b' });
        expect(engine.getJumpsForEdge('o2m-a')).toEqual([]);

        engine.cleanup();
        engine = LineJumpEngine.getInstance();
        engine.registerEdge('m2o-a', horizontal, { source: 'a', target: 'hub' });
        engine.registerEdge('m2o-b', vertical, { source: 'b', target: 'hub' });
        expect(engine.getJumpsForEdge('m2o-a')).toEqual([]);
    });
});
