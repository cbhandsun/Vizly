import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPLICATION_READINESS_TIMEOUT_MS, startApplication } from '../applicationStartup';
import { showStartupFailure } from '../startupFailureView';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('pre-React startup boundary', () => {
  it('mounts successfully even if the diagnostic clock fails', async () => {
    const mount = vi.fn();
    expect(await startApplication({ ready: Promise.resolve(), initialize: () => {}, mount,
      now: () => { throw new Error('private clock failure'); }, onFailure: vi.fn() })).toBe(true);
    expect(mount).toHaveBeenCalledOnce();
  });
  it('exports the stages reached before a mount failure without claiming first paint', async () => {
    let time = 100;
    await startApplication({ ready: Promise.resolve(), now: () => time,
      initialize: () => { time = 120; },
      mount: () => { time = 155; throw new Error('private'); },
      onFailure: summary => showStartupFailure(summary, document, () => {}),
    });
    const summary = JSON.parse(document.querySelector('textarea')?.value ?? '{}');
    expect(summary.milestones).toEqual([
      { stage: 'runtime-started', elapsedMs: 0 }, { stage: 'runtime-ready', elapsedMs: 20 },
      { stage: 'readiness-ready', elapsedMs: 20 }, { stage: 'mount-requested', elapsedMs: 20 },
      { stage: 'failed', elapsedMs: 55 },
    ]);
    expect(summary.elapsedMs).toBe(55);
    expect(JSON.stringify(summary)).not.toContain('private');
  });
  it('initializes before waiting and mounts only once ready', async () => {
    vi.useFakeTimers();
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>(resolve => { resolveReady = resolve; });
    const initialize = vi.fn(); const mount = vi.fn(); const onFailure = vi.fn();
    const result = startApplication({ ready, initialize, mount, onFailure });
    expect(initialize).toHaveBeenCalledOnce();
    expect(mount).not.toHaveBeenCalled();
    resolveReady?.();
    expect(await result).toBe(true);
    expect(mount).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, undefined, 'secret-token', new Error('private URL')])('classifies rejected readiness without exporting its reason', async reason => {
    const onFailure = vi.fn(); const mount = vi.fn();
    expect(await startApplication({ ready: Promise.reject(reason), initialize: () => {}, mount, onFailure,
      now: vi.fn().mockReturnValue(22).mockReturnValueOnce(10) })).toBe(false);
    expect(mount).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({ schema: 'vizly-startup-failure-v1',
      stage: 'readiness', code: 'application-readiness-failed', elapsedMs: 12,
      milestones: [{ stage: 'runtime-started', elapsedMs: 0 }, { stage: 'runtime-ready', elapsedMs: 12 },
        { stage: 'failed', elapsedMs: 12 }] });
  });

  it('times out once and ignores eventual readiness instead of mounting over recovery', async () => {
    vi.useFakeTimers();
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>(resolve => { resolveReady = resolve; });
    const mount = vi.fn(); const onFailure = vi.fn();
    const result = startApplication({ ready, initialize: () => {}, mount, onFailure });
    await vi.advanceTimersByTimeAsync(APPLICATION_READINESS_TIMEOUT_MS);
    expect(await result).toBe(false);
    expect(onFailure.mock.calls[0][0].code).toBe('application-readiness-timeout');
    resolveReady?.(); await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['runtime', 'mount'] as const)('classifies %s exceptions', async stage => {
    const onFailure = vi.fn();
    const throwFailure = () => { throw new Error('private'); };
    await startApplication({ ready: Promise.resolve(),
      initialize: stage === 'runtime' ? throwFailure : () => {},
      mount: stage === 'mount' ? throwFailure : () => {}, onFailure });
    expect(onFailure.mock.calls[0][0]).toMatchObject({ stage, code: stage === 'runtime'
      ? 'runtime-initialization-failed' : 'application-mount-failed' });
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain('private');
  });

  it.each([NaN, Infinity, -1, 600_001])('marks invalid elapsed time unavailable: %s', async elapsed => {
    const onFailure = vi.fn();
    await startApplication({ ready: Promise.resolve(), initialize: () => { throw null; },
      mount: () => {}, onFailure, now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(elapsed) });
    expect(onFailure.mock.calls[0][0].elapsedMs).toBeNull();
  });

  it('does not invoke a failed recovery handler twice', async () => {
    const onFailure = vi.fn(() => { throw new Error('recovery unavailable'); });
    await expect(startApplication({ ready: Promise.reject(null), initialize: () => {},
      mount: () => {}, onFailure })).rejects.toThrow('recovery unavailable');
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('shows selectable safe diagnostics and reloads only after the user clicks', () => {
    const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
    const reload = vi.fn();
    showStartupFailure({ schema: 'vizly-startup-failure-v1', stage: 'readiness',
      code: 'application-readiness-failed', elapsedMs: 12 }, document, reload);
    const summary = document.querySelector('textarea');
    expect(summary?.readOnly).toBe(true);
    expect(JSON.parse(summary?.value ?? '{}').code).toBe('application-readiness-failed');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
    document.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders recovery even without a root and never shows a rejected private payload', async () => {
    await startApplication({ initialize: () => {}, ready: Promise.reject('<img src=x onerror=alert(1)>token'),
      mount: () => {}, onFailure: summary => showStartupFailure(summary, document, () => {}) });
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('textarea')?.value).toContain('application-readiness-failed');
    expect(document.body.innerHTML).not.toContain('token');
    expect(document.querySelector('img')).toBeNull();
  });
});
