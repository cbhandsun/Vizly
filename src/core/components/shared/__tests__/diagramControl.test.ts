import { afterEach, describe, expect, it, vi } from 'vitest';

const logDiagramControlDispatchFailure = vi.fn();

vi.mock('../diagramControlLogging', () => ({
  logDiagramControlDispatchFailure,
}));

describe('diagramControl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logDiagramControlDispatchFailure.mockReset();
  });

  it('logs dispatch failures without throwing', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('Authorization: Bearer diagram-control-secret');
    });

    const { dispatchDiagramControl } = await import('../diagramControl');

    expect(() => dispatchDiagramControl('fit', 'diagram-1')).not.toThrow();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(logDiagramControlDispatchFailure).toHaveBeenCalledWith(
      'fit',
      expect.any(Error)
    );
  });
});
