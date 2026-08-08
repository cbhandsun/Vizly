/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

const createProps = (onOpenCommandPalette: () => void) => ({
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onSelectAll: vi.fn(),
  onCopy: vi.fn(),
  onPaste: vi.fn(),
  onGroup: vi.fn(),
  onUngroup: vi.fn(),
  onOpenCommandPalette,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('useKeyboardShortcuts modal isolation', () => {
  it('does not open the command palette behind a visible modal dialog', () => {
    const onOpenCommandPalette = vi.fn();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    Object.defineProperty(dialog, 'getClientRects', {
      value: () => ({ length: 1 }),
    });
    document.body.append(dialog);

    renderHook(() => useKeyboardShortcuts(createProps(onOpenCommandPalette)));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      }));
    });

    expect(onOpenCommandPalette).not.toHaveBeenCalled();
  });

  it('keeps the command palette shortcut available without a modal dialog', () => {
    const onOpenCommandPalette = vi.fn();
    renderHook(() => useKeyboardShortcuts(createProps(onOpenCommandPalette)));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      }));
    });

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('routes Escape to the configured canvas exit action', () => {
    const onEscapeEdit = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      ...createProps(vi.fn()),
      onEscapeEdit,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });

    expect(onEscapeEdit).toHaveBeenCalledOnce();
  });
});
