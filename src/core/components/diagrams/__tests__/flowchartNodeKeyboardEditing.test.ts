import { describe, expect, it } from 'vitest';
import { shouldStartFlowchartNodeKeyboardEditing } from '../../custom-nodes/flowchartNodeKeyboardEditing';

const createInput = (overrides: Partial<Parameters<typeof shouldStartFlowchartNodeKeyboardEditing>[0]> = {}) => ({
    key: 'Enter',
    editingAllowed: true,
    locked: false,
    isEditing: false,
    targetIsNode: true,
    ...overrides,
});

describe('shouldStartFlowchartNodeKeyboardEditing', () => {
    it.each(['Enter', 'F2'])('accepts the unmodified %s key on an editable node', (key) => {
        expect(shouldStartFlowchartNodeKeyboardEditing(createInput({ key }))).toBe(true);
    });

    it.each([
        { key: '', label: 'empty key' },
        { key: ' ', label: 'unsupported key' },
        { key: 42, label: 'non-string key' },
        { editingAllowed: false, label: 'read-only canvas' },
        { locked: true, label: 'locked node' },
        { isEditing: true, label: 'active editor' },
        { targetIsNode: false, label: 'nested control' },
        { ctrlKey: true, label: 'modified shortcut' },
        { metaKey: true, label: 'platform shortcut' },
        { altKey: true, label: 'alternate shortcut' },
        { shiftKey: true, label: 'shifted shortcut' },
    ])('rejects $label', ({ label: _label, ...overrides }) => {
        expect(shouldStartFlowchartNodeKeyboardEditing(createInput(overrides))).toBe(false);
    });
});
