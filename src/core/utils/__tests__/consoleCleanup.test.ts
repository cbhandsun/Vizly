import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log,
  time: console.time,
  timeEnd: console.timeEnd,
  group: console.group,
  groupEnd: console.groupEnd,
};

const importWithEnv = async (nodeEnv: string) => {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  return import('../consoleCleanup');
};

describe('consoleCleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(console, originalConsole);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    Object.assign(console, originalConsole);
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('allows safe logs in development and traces wrapped functions', async () => {
    const spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
      log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
    };

    const { safeLog, debugUtils } = await importWithEnv('development');

    safeLog.debug('debug');
    safeLog.info('info');
    safeLog.warn('warn');
    safeLog.error('error');
    safeLog.log('log');

    expect(spies.debug).toHaveBeenCalledWith('debug');
    expect(spies.info).toHaveBeenCalledWith('info');
    expect(spies.warn).toHaveBeenCalledWith('warn');
    expect(spies.error).toHaveBeenCalledWith('error');
    expect(spies.log).toHaveBeenCalledWith('log');

    const wrapped = debugUtils.trace((value: number) => value + 1, 'increment');
    expect(wrapped(1)).toBe(2);
    expect(spies.log).toHaveBeenCalledWith(expect.stringContaining('increment called with:'), [1]);
    expect(spies.log).toHaveBeenCalledWith(expect.stringContaining('increment returned:'), 2);
  });

  it('suppresses non-error safe logs and console.log in production', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { safeLog } = await importWithEnv('production');
    const cleanedConsoleLog = console.log;

    safeLog.debug('debug');
    safeLog.info('info');
    safeLog.warn('warn');
    safeLog.error('error');
    safeLog.log('log');
    cleanedConsoleLog('plain log');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('error');
    expect(log).not.toHaveBeenCalled();
  });

  it('measures performance in development and reports measurement failures', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const time = vi.spyOn(console, 'time').mockImplementation(() => undefined);
    const timeEnd = vi.spyOn(console, 'timeEnd').mockImplementation(() => undefined);
    const measure = vi.spyOn(performance, 'measure').mockImplementation(() => undefined as unknown as PerformanceMeasure);
    const getEntries = vi.spyOn(performance, 'getEntriesByName').mockReturnValue([
      { duration: 12.345 } as PerformanceEntry,
    ]);

    const { perfLog } = await importWithEnv('development');

    perfLog.time('load');
    perfLog.timeEnd('load');
    perfLog.measure('render');

    expect(time).toHaveBeenCalledWith('load');
    expect(timeEnd).toHaveBeenCalledWith('load');
    expect(measure).toHaveBeenCalledWith('render', undefined, undefined);
    expect(getEntries).toHaveBeenCalledWith('render');
    expect(log).toHaveBeenCalledWith('⏱️ render: 12.35ms');

    measure.mockImplementationOnce(() => {
      throw new Error('bad marks');
    });
    perfLog.measure('bad-render');
    expect(warn).toHaveBeenCalledWith('Performance measurement failed:', expect.any(Error));
  });

  it('does not run performance and debug helpers in production', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const group = vi.spyOn(console, 'group').mockImplementation(() => undefined);
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
    const time = vi.spyOn(console, 'time').mockImplementation(() => undefined);
    const timeEnd = vi.spyOn(console, 'timeEnd').mockImplementation(() => undefined);
    const { debugUtils, perfLog } = await importWithEnv('production');

    perfLog.time('load');
    perfLog.timeEnd('load');
    perfLog.measure('render');
    debugUtils.logIf(true, 'hidden');
    debugUtils.inspect({ a: 1 }, 'inspect');
    const fn = (value: number) => value + 1;

    expect(debugUtils.trace(fn, 'noop')).toBe(fn);
    expect(log).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    expect(groupEnd).not.toHaveBeenCalled();
    expect(time).not.toHaveBeenCalled();
    expect(timeEnd).not.toHaveBeenCalled();
  });

  it('toggles development debug mode and filters known console noise', async () => {
    const originalLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const originalDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const originalWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const originalError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { initDevConsoleFilters } = await importWithEnv('development');
    initDevConsoleFilters();

    console.log('hidden');
    console.info('hidden');
    console.debug('hidden');
    expect(originalLog).not.toHaveBeenCalledWith('hidden');
    expect(originalInfo).not.toHaveBeenCalledWith('hidden');
    expect(originalDebug).not.toHaveBeenCalledWith('hidden');

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'D',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    }));

    expect(localStorage.getItem('__diagram_debug_mode__')).toBe('true');
    expect(originalLog).toHaveBeenCalledWith(expect.stringContaining('Debug Mode ENABLED'));

    console.log('visible');
    console.info('visible-info');
    console.debug('visible-debug');
    expect(originalLog).toHaveBeenCalledWith('visible');
    expect(originalInfo).toHaveBeenCalledWith('visible-info');
    expect(originalDebug).toHaveBeenCalledWith('visible-debug');

    console.error('WebSocket connection to ws://iepose.cn failed token=abc');
    console.error('cdn.jsdelivr.net/npm/monaco-editor failed');
    console.warn('WebSocket connection to ws://iepose.cn failed');
    expect(originalError).not.toHaveBeenCalledWith('WebSocket connection to ws://iepose.cn failed token=abc');
    expect(originalError).not.toHaveBeenCalledWith('cdn.jsdelivr.net/npm/monaco-editor failed');
    expect(originalWarn).not.toHaveBeenCalledWith('WebSocket connection to ws://iepose.cn failed');

    console.error('real error');
    console.warn('real warn');
    expect(originalError).toHaveBeenCalledWith('real error');
    expect(originalWarn).toHaveBeenCalledWith('real warn');
  });
});
