// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FlowchartFileDropOverlay } from '../FlowchartFileDropOverlay';

describe('FlowchartFileDropOverlay', () => {
    it('renders localized English import guidance without Chinese fallback copy', () => {
        const messages: Record<string, string> = {
            'designer.flowchart.import.dropTitle': 'Drop to import file',
            'designer.flowchart.import.dropDescription': 'Supports JSON and Mermaid. You will confirm before the current page is replaced.',
        };

        render(<FlowchartFileDropOverlay t={(key) => messages[key] ?? key} />);

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('Drop to import file');
        expect(status.textContent).toContain('Supports JSON and Mermaid');
        expect(status.textContent).not.toMatch(/[\u3400-\u9fff]/u);
    });
});
