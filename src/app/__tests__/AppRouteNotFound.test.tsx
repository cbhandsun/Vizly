import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppRouteNotFound from '../AppRouteNotFound';

describe('AppRouteNotFound', () => {
  it('offers safe recovery without echoing an untrusted route', async () => {
    const onGoBack = vi.fn();
    const onReturnToProjects = vi.fn();

    render(
      <AppRouteNotFound
        onGoBack={onGoBack}
        onReturnToProjects={onReturnToProjects}
      />,
    );

    const projects = screen.getByRole('button', { name: 'Return to Projects' });
    const back = screen.getByRole('button', { name: 'Go back' });

    await waitFor(() => expect(document.activeElement).toBe(projects));
    const statusText = screen.getByRole('status').textContent ?? '';
    expect(statusText).toContain("This page doesn't exist");
    expect(statusText).not.toContain('/private/customer-diagram');

    fireEvent.click(projects);
    fireEvent.click(back);

    expect(onReturnToProjects).toHaveBeenCalledTimes(1);
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });
});
