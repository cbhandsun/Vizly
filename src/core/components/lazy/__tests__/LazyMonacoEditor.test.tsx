// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LazyMonacoEditor } from '../LazyMonacoEditor';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'designer.jsonEditor.basicEditorLabel': 'JSON 基础编辑器',
        }[key] ?? key),
    }),
}));

describe('LazyMonacoEditor', () => {
    it('provides an immediately editable local JSON editor', () => {
        const onChange = vi.fn();
        const onModeChange = vi.fn();
        render(
            <LazyMonacoEditor
                value={'{"name":"before"}'}
                onChange={onChange}
                onModeChange={onModeChange}
                language="json"
            />,
        );

        const editor = screen.getByRole('textbox', { name: 'JSON 基础编辑器' });
        expect((editor as HTMLTextAreaElement).value).toBe('{"name":"before"}');
        fireEvent.change(editor, { target: { value: '{"name":"after"}' } });
        expect(onChange).toHaveBeenCalledWith('{"name":"after"}');
        expect(onModeChange).toHaveBeenLastCalledWith('basic');
    });
});
