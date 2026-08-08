import { describe, expect, it } from 'vitest';

import { havePageTabsPropsChanged } from '../ui/designerCanvasFeaturesLayerMemo';

const createPagesProps = (
    disabled: boolean,
): Parameters<typeof havePageTabsPropsChanged>[0] => ({
    items: [{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }],
    activePageId: 'page-1',
    disabled,
});

describe('DesignerCanvasFeaturesLayer page memo boundary', () => {
    it('rerenders page controls when initial loading becomes editable', () => {
        const loading = createPagesProps(true);
        const ready = { ...loading, disabled: false };

        expect(havePageTabsPropsChanged(loading, ready)).toBe(true);
        expect(havePageTabsPropsChanged(ready, ready)).toBe(false);
    });
});
