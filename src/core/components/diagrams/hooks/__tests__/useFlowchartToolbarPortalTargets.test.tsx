// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowchartToolbarPortalTargets } from '../useFlowchartToolbarPortalTargets';

const Harness = ({ isMobile }: { isMobile: boolean }) => {
    const { bottom, center, context } = useFlowchartToolbarPortalTargets(isMobile);
    return (
        <>
            {bottom && createPortal(<span data-testid="bottom-content">bottom</span>, bottom)}
            {center && createPortal(<span data-testid="center-content">center</span>, center)}
            {context && createPortal(<span data-testid="context-content">context</span>, context)}
        </>
    );
};

const appendPortalTargets = (version: string) => {
    for (const name of ['bottom', 'center', 'context']) {
        const target = document.createElement('div');
        target.id = `vizly-plugin-${name}-island-portal`.replace('-context-island', '-context-toolbar');
        target.dataset.version = version;
        document.body.append(target);
    }
};

describe('useFlowchartToolbarPortalTargets', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        appendPortalTargets('mobile');
    });

    it('rebinds portals when the responsive shell replaces its target elements', async () => {
        const { rerender } = render(<Harness isMobile />);
        await screen.findByTestId('bottom-content');

        document.querySelectorAll('[data-version="mobile"]').forEach(target => target.remove());
        appendPortalTargets('desktop');
        rerender(<Harness isMobile={false} />);

        await waitFor(() => {
            expect(screen.getByTestId('bottom-content').parentElement?.dataset.version).toBe('desktop');
            expect(screen.getByTestId('center-content').parentElement?.dataset.version).toBe('desktop');
            expect(screen.getByTestId('context-content').parentElement?.dataset.version).toBe('desktop');
        });
    });
});
