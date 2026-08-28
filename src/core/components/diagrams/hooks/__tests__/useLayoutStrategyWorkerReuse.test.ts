// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidthWithOverrides: () => 180,
      calculateNodeHeightWithOverrides: () => 80,
    }),
  },
}));

import {
  createLazyElkLayoutExecutor,
  loadDomainCompoundElkStrategy,
  loadDomainElkStrategy,
} from '../layoutStrategyRuntime';

const graph = { id: 'root', children: [] };

const createDeferred = <T>() => {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
  };
};

describe('layout strategy worker reuse', () => {
  it('reuses layered strategy instances across repeated layout switches', async () => {
    const [firstFlat, secondFlat, firstCompound, secondCompound] = await Promise.all([
      loadDomainElkStrategy(),
      loadDomainElkStrategy(),
      loadDomainCompoundElkStrategy(),
      loadDomainCompoundElkStrategy(),
    ]);

    expect(secondFlat).toBe(firstFlat);
    expect(secondCompound).toBe(firstCompound);
    expect(firstCompound).not.toBe(firstFlat);
  });

  it('loads lazily and reuses one executor for sequential Canvas layouts', async () => {
    const run = vi.fn().mockResolvedValue(graph);
    const dispose = vi.fn();
    const createElkLayoutExecutor = vi.fn(() => ({ run, dispose }));
    const loader = vi.fn().mockResolvedValue({ createElkLayoutExecutor });
    const executor = createLazyElkLayoutExecutor(loader);

    expect(loader).not.toHaveBeenCalled();
    await expect(executor.run(graph)).resolves.toEqual(graph);
    await expect(executor.run(graph)).resolves.toEqual(graph);

    expect(loader).toHaveBeenCalledOnce();
    expect(createElkLayoutExecutor).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(2);
    executor.dispose();
    executor.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('retries a failed dynamic import on the next layout', async () => {
    const run = vi.fn().mockResolvedValue(graph);
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce({
        createElkLayoutExecutor: () => ({ run, dispose: vi.fn() }),
      });
    const executor = createLazyElkLayoutExecutor(loader);

    await expect(executor.run(graph)).rejects.toThrow('chunk unavailable');
    await expect(executor.run(graph)).resolves.toEqual(graph);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('retries an executor factory failure and isolates Canvas owners', async () => {
    const firstRun = vi.fn().mockResolvedValue(graph);
    const secondRun = vi.fn().mockResolvedValue(graph);
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const createElkLayoutExecutor = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('worker construction failed');
      })
      .mockReturnValueOnce({ run: firstRun, dispose: firstDispose })
      .mockReturnValueOnce({ run: secondRun, dispose: secondDispose });
    const loader = vi.fn().mockResolvedValue({ createElkLayoutExecutor });
    const firstCanvas = createLazyElkLayoutExecutor(loader);
    const secondCanvas = createLazyElkLayoutExecutor(loader);

    await expect(firstCanvas.run(graph)).rejects.toThrow('worker construction failed');
    await expect(firstCanvas.run(graph)).resolves.toEqual(graph);
    await expect(secondCanvas.run(graph)).resolves.toEqual(graph);

    expect(loader).toHaveBeenCalledTimes(3);
    expect(firstRun).toHaveBeenCalledOnce();
    expect(secondRun).toHaveBeenCalledOnce();
    firstCanvas.dispose();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    secondCanvas.dispose();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('retires an executor whose import resolves after Canvas disposal', async () => {
    const run = vi.fn().mockResolvedValue(graph);
    const dispose = vi.fn();
    const deferred = createDeferred<{
      createElkLayoutExecutor: () => {
        run: typeof run;
        dispose: typeof dispose;
      };
    }>();
    const executor = createLazyElkLayoutExecutor(() => deferred.promise);
    const pending = executor.run(graph);

    executor.dispose();
    deferred.resolve({ createElkLayoutExecutor: () => ({ run, dispose }) });

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'elk-layout-executor-disposed',
    });
    expect(run).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    await expect(executor.run(graph)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
