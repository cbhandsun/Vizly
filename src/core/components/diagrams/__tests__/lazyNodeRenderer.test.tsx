/** @vitest-environment jsdom */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createLazyNodeRenderer } from '../lazyNodeRenderer';

describe('createLazyNodeRenderer', () => {
  it('isolates a pending node renderer without suspending sibling content', async () => {
    let resolveModule: ((module: { default: React.ComponentType<{ label: string }> }) => void) | undefined;
    const load = vi.fn(() => new Promise<{ default: React.ComponentType<{ label: string }> }>((resolve) => {
      resolveModule = resolve;
    }));
    const DeferredNode = createLazyNodeRenderer(load);

    render(
      <div>
        <span>Canvas chrome</span>
        <DeferredNode label="Deferred node" />
      </div>,
    );

    expect(screen.getByText('Canvas chrome')).toBeTruthy();
    expect(screen.queryByText('Deferred node')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveModule?.({ default: ({ label }) => <span>{label}</span> });
    });

    expect(screen.getByText('Deferred node')).toBeTruthy();
  });
});
