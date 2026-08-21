// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapPropertyLinkField } from '../MindMapPropertyLinkField';

const renderField = (initialValue = '', onCommit = vi.fn()) => {
    const view = render(
        <MindMapPropertyLinkField
            initialValue={initialValue}
            invalidMessage="Enter a valid HTTP or HTTPS link."
            label="Link"
            onCommit={onCommit}
        />,
    );
    return { ...view, onCommit };
};

describe('MindMapPropertyLinkField', () => {
    it('normalizes and commits a valid link on blur', () => {
        const { onCommit } = renderField();
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: 'example.com/path' } });
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledWith('https://example.com/path');
        expect(input.value).toBe('https://example.com/path');
        expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it('preserves an invalid draft and does not overwrite the existing safe link', () => {
        const { onCommit } = renderField('https://example.com/current');
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
        fireEvent.blur(input);

        const alert = screen.getByRole('alert');
        expect(onCommit).not.toHaveBeenCalled();
        expect(input.value).toBe('javascript:alert(1)');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(alert.id);
        expect(alert.textContent).toBe('Enter a valid HTTP or HTTPS link.');
    });

    it('clears the validation message as soon as the user resumes editing', () => {
        renderField();
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: 'ftp://example.com/file' } });
        fireEvent.blur(input);
        expect(screen.getByRole('alert')).not.toBeNull();

        fireEvent.change(input, { target: { value: 'https://example.com/file' } });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(input.getAttribute('aria-invalid')).toBe('false');
        expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    it('treats an empty draft as an explicit clear', () => {
        const { onCommit } = renderField('https://example.com/current');
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledWith(undefined);
        expect(input.value).toBe('');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('uses the same recoverable validation contract for Enter and extreme input', () => {
        const { onCommit } = renderField();
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });
        const oversized = `https://example.com/${'x'.repeat(2050)}`;

        fireEvent.change(input, { target: { value: oversized } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

        expect(onCommit).not.toHaveBeenCalled();
        expect(input.value).toBe(oversized);
        expect(screen.getByRole('alert')).not.toBeNull();
    });

    it('commits once when Enter is followed by the input blur', () => {
        const { onCommit } = renderField();
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: 'example.com/release' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('https://example.com/release');
    });

    it('emits one clear when Enter and blur occur before the parent rerenders', () => {
        const { onCommit } = renderField('https://example.com/current');
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(undefined);
    });

    it('resets the draft and error when the selected node value changes', () => {
        const { rerender } = renderField('https://example.com/first');
        const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });

        fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
        fireEvent.blur(input);
        expect(screen.getByRole('alert')).not.toBeNull();

        rerender(
            <MindMapPropertyLinkField
                initialValue="https://example.com/second"
                invalidMessage="Enter a valid HTTP or HTTPS link."
                label="Link"
                onCommit={vi.fn()}
            />,
        );

        expect(input.value).toBe('https://example.com/second');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
