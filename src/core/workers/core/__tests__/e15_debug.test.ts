import { describe, it } from 'vitest';
import { EdgeRoutingWorker } from '../EdgeRoutingWorker';
import { createDefaultRoutingConfig } from '../../../types/routing';
import * as fs from 'fs';
import * as path from 'path';

describe('EdgeRoutingWorker E-15 Debug', () => {
    it('debugs e-15 routing error', async () => {
        const { getNodePosition } = await import('../../../algorithms/smartEdgeUtils');

        const inputs = [
            { name: "null", val: null },
            { name: "undefined", val: undefined },
            { name: "empty object", val: {} },
            { name: "computed null", val: { computed: null } },
            { name: "computed posAbs null", val: { computed: { positionAbsolute: null } } },
            { name: "posAbs null", val: { positionAbsolute: null } },
            { name: "position null", val: { position: null } },
            { name: "position coordinates null", val: { position: { x: null, y: null } } },
            { name: "positionAbsolute coordinates null", val: { positionAbsolute: { x: null, y: null } } },
        ];

        for (const input of inputs) {
            try {
                const res = getNodePosition(input.val as any);
                console.log(`Input ${input.name} returned:`, res, "res.x:", res?.x);
            } catch (err: any) {
                console.log(`Input ${input.name} THREW:`, err.message);
            }
        }

        const contextPath = "C:\\Users\\juhon\\.gemini\\antigravity\\brain\\e1b9ca87-1c2b-4fa8-8840-575d3a8a2357\\scratch\\context_e15.json";
        const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));

        const sNode = context.graph.nodes.find((n: any) => n.id === context.job.source);
        const tNode = context.graph.nodes.find((n: any) => n.id === context.job.target);

        // Run EdgeRoutingWorker.execute
        try {
            const config = {
                ...createDefaultRoutingConfig(),
                ...context.config
            };
            const result = EdgeRoutingWorker.execute({
                job: context.job,
                graph: context.graph,
                config: config,
                runtime: {}
            } as any);
            console.log("Result path length:", result.path ? result.path.length : 0);
            console.log("Result error:", result.error);
        } catch (err: any) {
            console.error("CRITICAL EXCEPTION IN EdgeRoutingWorker.execute:", err);
            console.error("Stack trace:", err.stack);
            throw err;
        }
    });
});

