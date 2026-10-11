import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferredCommandPalette } from '../DeferredCommandPalette';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@vizly/core/logging', () => ({ logUiBoundaryError: vi.fn() }));
vi.mock('antd/es/modal', () => ({ default: ({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) => (
  <div role="dialog"><button onClick={onCancel}>dismiss pending</button>{children}</div>
) }));

type Loader = Parameters<typeof createDeferredCommandPalette>[0];
type LoadedModule = Awaited<ReturnType<Loader>>;
const loadedModule: LoadedModule = { CommandPalette: ({ onDismiss, onClose }) => (
  <div role="dialog"><button onClick={onDismiss ?? onClose}>dismiss loaded</button><input aria-label="search" /></div>
) };

afterEach(() => vi.restoreAllMocks());

describe('deferred command palette lifecycle', () => {
  it('does not request the command module while closed', () => {
    const load = vi.fn<Loader>().mockResolvedValue(loadedModule);
    const Palette = createDeferredCommandPalette(load);
    render(<Palette open={false} onClose={vi.fn()} items={[]} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps opening cancellable and ignores a module that settles after dismissal', async () => {
    let resolveModule: (module: LoadedModule) => void = () => { throw new Error('No pending load'); };
    const load = vi.fn<Loader>(() => new Promise(resolve => { resolveModule = resolve; }));
    const Palette = createDeferredCommandPalette(load);
    const restoreFocus = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return open ? <Palette open items={[]} onClose={() => setOpen(false)} onDismiss={() => {
        setOpen(false); restoreFocus();
      }} /> : <button>canvas</button>;
    }
    render(<Host />);
    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('dismiss pending'));
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    await act(async () => resolveModule(loadedModule));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('canvas')).toBeVisible();
  });

  it('loads an empty command list and forwards the dismissal contract', async () => {
    const load = vi.fn<Loader>().mockResolvedValue(loadedModule);
    const Palette = createDeferredCommandPalette(load);
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(<Palette open items={[]} onClose={onClose} onDismiss={onDismiss} />);
    await screen.findByRole('textbox', { name: 'search' });
    fireEvent.click(screen.getByText('dismiss loaded'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('isolates a failed chunk, permits dismissal and a fresh loader on reopening', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.fn<Loader>().mockRejectedValueOnce(new Error('Chunk unavailable')).mockResolvedValue(loadedModule);
    const Palette = createDeferredCommandPalette(load);
    function Host() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(true)}>open</button>{open && <Palette open items={[]} onClose={() => setOpen(false)} />}</>;
    }
    render(<Host />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('designer.commandPalette.loadFailed'));
    fireEvent.click(screen.getByText('dismiss pending'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('open'));
    await screen.findByRole('textbox', { name: 'search' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
