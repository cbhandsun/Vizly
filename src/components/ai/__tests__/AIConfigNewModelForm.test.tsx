import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

import { AIConfigNewModelForm } from '../AIConfigNewModelForm';

afterEach(cleanup);

const emptyDraft = { id: '', name: '', group: '' };

describe('AIConfigNewModelForm', () => {
    it('keeps confirmation disabled and exposes an inline error for invalid input', () => {
        render(
            <AIConfigNewModelForm
                draft={emptyDraft}
                validation={{ ok: false, issue: 'missing-model-id' }}
                onChange={vi.fn()}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        const modelId = screen.getByRole('textbox', { name: 'aiConfig.modelIdLabel' });
        expect(modelId.getAttribute('aria-invalid')).toBe('true');
        expect(modelId.getAttribute('aria-describedby')).toBe('ai-config-new-model-error');
        expect(screen.getByRole('alert').textContent).toBe('aiConfig.modelValidation.missing-model-id');
        expect(screen.getByRole('button', { name: 'aiConfig.confirmAdd' }).hasAttribute('disabled')).toBe(true);
    });

    it('enables confirmation for a validated model and forwards field changes', () => {
        const onChange = vi.fn();
        const onConfirm = vi.fn();
        const draft = { id: 'vendor/model', name: '', group: '' };
        render(
            <AIConfigNewModelForm
                draft={draft}
                validation={{
                    ok: true,
                    model: { id: 'vendor/model', name: 'vendor/model', group: 'Custom', enabled: true, isCustom: true },
                }}
                onChange={onChange}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: 'aiConfig.displayNameLabel' }), {
            target: { value: 'Vendor Model' },
        });
        expect(onChange).toHaveBeenCalledWith({ ...draft, name: 'Vendor Model' });

        const confirm = screen.getByRole('button', { name: 'aiConfig.confirmAdd' });
        expect(confirm.hasAttribute('disabled')).toBe(false);
        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
