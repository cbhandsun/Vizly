import { describe, expect, it } from 'vitest';

import { FlowchartPlugin } from '../FlowchartPlugin';

describe('FlowchartPlugin migration', () => {
    it('adds the legacy default shape without mutating the input', async () => {
        const source = { nodes: [{ id: 'a', metadata: {} }] };
        const result = await new FlowchartPlugin().migrate(source, '1.0');

        expect(result).toEqual({ nodes: [{ id: 'a', metadata: { shape: 'rectangle' } }] });
        expect(source).toEqual({ nodes: [{ id: 'a', metadata: {} }] });
    });

    it('preserves malformed and current-version payloads', async () => {
        const plugin = new FlowchartPlugin();

        await expect(plugin.migrate(null, '1.0')).resolves.toBeNull();
        await expect(plugin.migrate({ nodes: ['invalid'] }, plugin.version)).resolves.toEqual({ nodes: ['invalid'] });
    });
});
