// @vitest-environment jsdom
import { lazy, type ComponentType } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsPanelBoundary } from '../SettingsPanelBoundary';

describe('SettingsPanelBoundary', () => {
  it('distinguishes requested, suspended and committed content, then cleans up', async () => {
    let finish: ((value: { default: ComponentType }) => void) | undefined;
    const Panel = lazy(() => new Promise<{ default: ComponentType }>(resolve => { finish = resolve; }));
    const { container, unmount } = render(<SettingsPanelBoundary><Panel /></SettingsPanelBoundary>);
    const phase = (name: string) => container.querySelector(`[data-settings-panel-phase="${name}"]`);
    expect(phase('requested')).not.toBeNull();
    expect(phase('loading')).not.toBeNull();
    expect(phase('ready')).toBeNull();
    await act(async () => { finish?.({ default: () => <button>Settings</button> }); });
    expect(phase('requested')).not.toBeNull();
    expect(phase('loading')).toBeNull();
    expect(phase('ready')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Settings');
    expect([...container.querySelectorAll('span')].every(marker => marker.hidden && !marker.textContent)).toBe(true);
    unmount();
    expect(phase('requested')).toBeNull();
  });

  it('removes pending markers when closed before the import resolves', () => {
    const Panel = lazy(() => new Promise<{ default: ComponentType }>(() => {}));
    const { container, unmount } = render(<SettingsPanelBoundary><Panel /></SettingsPanelBoundary>);
    expect(container.querySelector('[data-settings-panel-phase="loading"]')).not.toBeNull();
    unmount();
    expect(container.childElementCount).toBe(0);
  });
});
