// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'diagramViewer.rename.action': 'Rename diagram',
      'diagramViewer.rename.label': 'Diagram name',
      'diagramViewer.rename.inputLabel': 'New diagram name',
      'diagramViewer.rename.failed': 'Rename failed',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
    }[key] ?? key),
  }),
}));

vi.mock('@ant-design/icons', () => ({
  EditOutlined: () => <span aria-hidden="true">edit</span>,
}));

vi.mock('antd', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    className,
    style,
    'aria-label': ariaLabel,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
    'aria-label'?: string;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} className={className} style={style} aria-label={ariaLabel}>
      {children ?? ariaLabel}
    </button>
  ),
  Input: ({
    id,
    value,
    onChange,
    'aria-label': ariaLabel,
  }: {
    id?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    'aria-label'?: string;
  }) => <input id={id} value={value} onChange={onChange} aria-label={ariaLabel} />,
  Popover: ({
    children,
    content,
    open,
    onOpenChange,
  }: {
    children: React.ReactElement;
    content: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      <div onClick={() => onOpenChange?.(!open)}>{children}</div>
      {open ? content : null}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Typography: {
    Text: ({ children, role }: { children: React.ReactNode; role?: string }) => (
      <span role={role}>{children}</span>
    ),
  },
}));

import { DiagramTitleEditor } from '../DiagramTitleEditor';

describe('DiagramTitleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames with trimmed input and closes after success', async () => {
    const onRename = vi.fn(async () => undefined);
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename diagram' }));
    const input = screen.getByRole('textbox', { name: 'New diagram name' });
    fireEvent.change(input, { target: { value: '  Order approval  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Order approval'));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'New diagram name' })).toBeNull();
    });
  });

  it('keeps the editor open and exposes a status when persistence fails', async () => {
    const onRename = vi.fn(async () => {
      throw new Error('persist failed');
    });
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Rename failed');
    expect(screen.getByRole('textbox', { name: 'New diagram name' })).toBeTruthy();
  });

  it('uses the commercial touch target when requested by a mobile toolbar', () => {
    render(
      <DiagramTitleEditor
        title="Untitled flowchart"
        onRename={vi.fn(async () => undefined)}
        commercialTouchTarget
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Rename diagram' });
    expect(trigger.className).toContain('w-[44px]');
    expect(trigger.className).toContain('min-h-[44px]');
    expect(trigger.style.width).toBe('var(--commercial-touch-target, 44px)');
    expect(trigger.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
  });
});
