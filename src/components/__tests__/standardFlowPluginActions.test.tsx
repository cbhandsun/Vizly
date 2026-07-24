import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@/core/types/plugin';
import { StandardFlowPlugin } from '../diagrams/plugins/StandardFlowPlugin';

describe('StandardFlowPlugin AI actions', () => {
    it('rejects malformed parameters and bounds service node fields', async () => {
        const addNode = vi.fn(() => 'node-1');
        const context = { addNode } as unknown as PluginContext;
        const plugin = new StandardFlowPlugin();

        await expect(plugin.onAIAction('add-service', [], context)).resolves.toBe(false);
        await expect(plugin.onAIAction('add-service', {
            label: 'x'.repeat(1200),
            domainClass: 'domain'.repeat(30),
        }, context)).resolves.toBe(true);

        expect(addNode).toHaveBeenCalledWith('customNode', {
            label: 'x'.repeat(1000),
            domainClass: 'domain'.repeat(30).slice(0, 100),
            type: 'microservice',
        });
    });
});
