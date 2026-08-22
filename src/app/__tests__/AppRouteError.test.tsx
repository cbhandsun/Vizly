import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppRouteError from '../AppRouteError';

describe('AppRouteError', () => {
  it('shows safe recovery actions without exposing a raw route failure', async () => {
    const onRetry = vi.fn();
    const onReturnToProjects = vi.fn();

    render(
      <AppRouteError
        onRetry={onRetry}
        onReturnToProjects={onReturnToProjects}
      />,
    );

    const retry = screen.getByRole('button', { name: 'Reload screen' });
    const projects = screen.getByRole('button', { name: 'Return to Projects' });

    await waitFor(() => expect(document.activeElement).toBe(retry));
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-describedby')).toBe('app-route-error-description');
    expect(document.getElementById('app-route-error-description')?.textContent).toBe(
      'This screen stopped loading. Reload to try again, or return to Projects and reopen the diagram.',
    );
    expect(screen.queryByText(/Failed to fetch dynamically imported module/i)).toBeNull();

    fireEvent.click(retry);
    fireEvent.click(projects);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReturnToProjects).toHaveBeenCalledTimes(1);
  });
});
