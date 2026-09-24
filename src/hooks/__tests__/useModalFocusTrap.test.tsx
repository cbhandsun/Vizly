// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useModalFocusTrap } from '../useModalFocusTrap';

const TestDialog = ({ onClose }: { onClose: () => void }) => {
  const { containerRef, handleKeyDown } = useModalFocusTrap<HTMLDivElement>({
    active: true,
    onClose,
  });

  return (
    <div ref={containerRef} role="dialog" aria-label="Parent" tabIndex={-1} onKeyDown={handleKeyDown}>
      <button type="button">Regular</button>
      <input data-preserve-dialog-on-escape="true" aria-label="Rename" />
      <div role="dialog" aria-label="Nested">
        <button type="button">Nested action</button>
      </div>
    </div>
  );
};

describe('useModalFocusTrap', () => {
  it('closes for an unowned Escape but preserves nested and explicitly owned layers', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Regular' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rename' }), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested action' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('owns forward and backward Tab traversal inside the active dialog', () => {
    render(<TestDialog onClose={vi.fn()} />);
    const regular = screen.getByRole('button', { name: 'Regular' });
    const rename = screen.getByRole('textbox', { name: 'Rename' });
    const nestedAction = screen.getByRole('button', { name: 'Nested action' });

    regular.focus();
    fireEvent.keyDown(regular, { key: 'Tab' });
    expect(document.activeElement).toBe(rename);

    fireEvent.keyDown(rename, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(regular);

    fireEvent.keyDown(regular, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nestedAction);
  });
});
