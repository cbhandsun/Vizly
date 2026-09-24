import { fireEvent, render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { AIConfigGlobalSettingsForm } from '../AIConfigGlobalSettingsForm';
import { AI_SYSTEM_PROMPT_MAX_LENGTH } from '../aiConfigStorage';

const t = ((key: string) => key) as TFunction;

class TestResizeObserver implements ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
});

Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })),
});

describe('AIConfigGlobalSettingsForm', () => {
    it('exposes the prompt limit and sends bounded edits through the draft callback', () => {
        const onChange = vi.fn();
        render(<AIConfigGlobalSettingsForm systemPrompt="prompt" t={t} onChange={onChange} />);
        const field = screen.getByRole('textbox', { name: 'aiConfig.systemPromptLabel' });

        expect(field.getAttribute('maxLength')).toBe(String(AI_SYSTEM_PROMPT_MAX_LENGTH));
        expect(screen.getByText(`6 / ${AI_SYSTEM_PROMPT_MAX_LENGTH}`)).not.toBeNull();
        fireEvent.change(field, { target: { value: 'updated prompt' } });
        expect(onChange).toHaveBeenCalledWith('updated prompt');
    });
});
