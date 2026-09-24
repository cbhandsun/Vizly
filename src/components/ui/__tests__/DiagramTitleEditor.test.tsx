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
      'diagramViewer.saveAs.nameRequired': 'Name cannot be empty',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
    }[key] ?? key),
  }),
}));

vi.mock('@ant-design/icons', () => ({
  EditOutlined: () => <span aria-hidden="true">edit</span>,
}));

vi.mock('antd', () => ({
  Button: React.forwardRef<HTMLButtonElement, {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
    'aria-label'?: string;
    'aria-haspopup'?: React.AriaAttributes['aria-haspopup'];
    'aria-expanded'?: boolean;
    'aria-controls'?: string;
  }>(({
    children,
    disabled,
    onClick,
    className,
    style,
    'aria-label': ariaLabel,
    'aria-haspopup': ariaHasPopup,
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
  }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={style}
      aria-label={ariaLabel}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {children ?? ariaLabel}
    </button>
  )),
  Input: React.forwardRef<HTMLInputElement, {
    id?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    onPressEnter?: React.KeyboardEventHandler<HTMLInputElement>;
    style?: React.CSSProperties;
    'aria-label'?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }>(({
    id,
    value,
    onChange,
    onKeyDown,
    onPressEnter,
    style,
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
  }, ref) => (
    <input
      ref={ref}
      id={id}
      value={value}
      onChange={onChange}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter') onPressEnter?.(event);
      }}
      style={style}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  )),
  Popover: ({
    children,
    content,
    open,
    onOpenChange,
    afterOpenChange,
  }: {
    children: React.ReactElement;
    content: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    afterOpenChange?: (open: boolean) => void;
  }) => {
    React.useEffect(() => {
      afterOpenChange?.(Boolean(open));
    }, [afterOpenChange, open]);

    return (
      <div>
        <div onClick={() => onOpenChange?.(!open)}>{children}</div>
        {open ? content : null}
      </div>
    );
  },
  Tooltip: ({
    children,
    title,
    open,
  }: {
    children: React.ReactNode;
    title?: React.ReactNode;
    open?: boolean;
  }) => (
    <>
      {children}
      {open === false ? null : <span role="tooltip">{title}</span>}
    </>
  ),
  Typography: {
    Text: ({
      children,
      role,
      id,
    }: {
      children: React.ReactNode;
      role?: string;
      id?: string;
    }) => <span id={id} role={role}>{children}</span>,
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

  it('shows an accessible validation error for an empty title', async () => {
    const onRename = vi.fn(async () => undefined);
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename diagram' }));
    const input = screen.getByRole('textbox', { name: 'New diagram name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Name cannot be empty');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(onRename).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the editor open and exposes a status when persistence fails', async () => {
    const onRename = vi.fn(async () => {
      throw new Error('persist failed');
    });
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    const input = screen.getByRole('textbox', { name: 'New diagram name' });
    expect(alert.textContent).toContain('Rename failed');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('suppresses the tooltip while exposing dialog semantics', () => {
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={vi.fn(async () => undefined)} />);

    const trigger = screen.getByRole('button', { name: 'Rename diagram' });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Diagram name' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
  });

  it('selects the current title and restores trigger focus after Escape', async () => {
    render(<DiagramTitleEditor title="Untitled flowchart" onRename={vi.fn(async () => undefined)} />);

    const trigger = screen.getByRole('button', { name: 'Rename diagram' });
    fireEvent.click(trigger);
    const input = screen.getByRole('textbox', { name: 'New diagram name' }) as HTMLInputElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('Untitled flowchart'.length);
    });

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('uses the commercial touch target throughout the mobile editor', () => {
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

    fireEvent.click(trigger);
    const input = screen.getByRole('textbox', { name: 'New diagram name' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(input.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    expect(cancel.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    expect(cancel.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
    expect(save.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    expect(save.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
  });
});
