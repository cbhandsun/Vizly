import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeferredEnhancedThemeSelector } from '../DeferredEnhancedThemeSelector';

const mocks = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('../EnhancedThemeSelector', () => ({
  EnhancedThemeSelector: (props: { initialOpen?: boolean }) => {
    mocks.render(props);
    return <div role="dialog" aria-label="Loaded theme selector" />;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: () => 'Theme Settings' }),
}));

describe('DeferredEnhancedThemeSelector', () => {
  it('prefetches without mounting and opens the lazy selector on the first click', async () => {
    render(<DeferredEnhancedThemeSelector ariaLabel="Open theme settings" />);

    const trigger = screen.getByRole('button', { name: 'Open theme settings' });
    expect(mocks.render).not.toHaveBeenCalled();

    fireEvent.pointerEnter(trigger);
    await Promise.resolve();
    expect(mocks.render).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Loaded theme selector' })).toBeTruthy();
    await waitFor(() => expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      initialOpen: true,
    })));
  });
});
