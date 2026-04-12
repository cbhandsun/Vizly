
import { EdgeDecisionService } from '../EdgeDecisionService';
import { EdgeType } from '@/core';
import { decideEdgeRouting } from '@/core';
import { Node } from '@xyflow/react';

// Mock the dependencies
jest.mock('@/utils/HandlePicker', () => ({
    decideEdgeRouting: jest.fn()
}));

jest.mock('@/components/config/DiagramConfig', () => ({
    diagramConfigManager: {
        getConfig: () => ({ edge: {} })
    }
}));

jest.mock('@/config/LayeredConfigManager', () => ({
    LayeredConfigManager: {
        getInstance: () => ({
            get: (key: string, def: any) => def
        })
    }
}));

describe('EdgeDecisionService', () => {
    let service: EdgeDecisionService;
    const mockDecideEdgeRouting = decideEdgeRouting as jest.Mock;

    beforeEach(() => {
        service = new EdgeDecisionService();
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('autoDecideHandlesAndType', () => {
        const mockS: Node = { id: 's', position: { x: 0, y: 0 }, data: {} };
        const mockT: Node = { id: 't', position: { x: 100, y: 100 }, data: {} };

        it('should return presetType if nodes are missing', () => {
            const result = service.autoDecideHandlesAndType(
                undefined, undefined, [], false, 'default', true, EdgeType.STEP
            );
            expect(result.type).toBe(EdgeType.STEP);
            expect(mockDecideEdgeRouting).not.toHaveBeenCalled();
        });

        it('should return fallback type if nodes are missing and no presetType', () => {
            // globalPath 'straight' -> STRAIGHT
            const result = service.autoDecideHandlesAndType(
                undefined, undefined, [], false, 'straight', true
            );
            expect(result.type).toBe(EdgeType.STRAIGHT);
        });

        it('should call decideEdgeRouting and return its result when nodes are present', () => {
            mockDecideEdgeRouting.mockReturnValue({
                type: EdgeType.SMOOTHSTEP,
                sourceHandle: 'r',
                targetHandle: 'l'
            });

            const result = service.autoDecideHandlesAndType(
                mockS, mockT, [], true, 'smart', true
            );

            expect(mockDecideEdgeRouting).toHaveBeenCalled();
            expect(result.type).toBe(EdgeType.SMOOTHSTEP);
            expect(result.sourceHandle).toBe('r');
            expect(result.targetHandle).toBe('l');
        });

        it('should pass correct preferSmart flag to helper', () => {
            mockDecideEdgeRouting.mockReturnValue({ type: EdgeType.BEZIER });

            service.autoDecideHandlesAndType(
                mockS, mockT, [], true, 'smart', true
            );

            // Verify the 'mode' in the options object passed to decideEdgeRouting
            const callArgs = mockDecideEdgeRouting.mock.calls[0];
            const options = callArgs[3];
            expect(options.mode).toBe('advanced-smart');
        });

        it('should default to native mode if preferSmart is false', () => {
            mockDecideEdgeRouting.mockReturnValue({ type: EdgeType.BEZIER });

            service.autoDecideHandlesAndType(
                mockS, mockT, [], false, 'default', true
            );

            const callArgs = mockDecideEdgeRouting.mock.calls[0];
            const options = callArgs[3];
            expect(options.mode).toBe('native');
        });

        it('should respect layoutDirection param', () => {
            mockDecideEdgeRouting.mockReturnValue({ type: EdgeType.BEZIER });
            service.autoDecideHandlesAndType(
                mockS, mockT, [], true, 'smart', true, undefined, null, null, undefined, 'TB'
            );
            const callArgs = mockDecideEdgeRouting.mock.calls[0];
            const options = callArgs[3];
            expect(options.layoutDirection).toBe('TB');
        });
    });
});
