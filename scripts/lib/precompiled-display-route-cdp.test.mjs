import { describe, expect, it, vi } from 'vitest';

import { retryPrecompiledRouteBrowserProfileCleanup } from './precompiled-display-route-cdp.mjs';

describe('precompiled display route browser profile cleanup', () => {
  it('returns immediately after a successful cleanup', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn();

    await expect(retryPrecompiledRouteBrowserProfileCleanup(remove, wait)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries bounded Windows file-lock failures', async () => {
    const remove = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('permission'), { code: 'EPERM' }))
      .mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await retryPrecompiledRouteBrowserProfileCleanup(remove, wait, 4);

    expect(remove).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 150);
    expect(wait).toHaveBeenNthCalledWith(2, 300);
  });

  it('fails closed for non-retryable and exhausted cleanup errors', async () => {
    const invalid = Object.assign(new Error('invalid path'), { code: 'EINVAL' });
    const locked = Object.assign(new Error('still locked'), { code: 'ENOTEMPTY' });
    await expect(retryPrecompiledRouteBrowserProfileCleanup(
      vi.fn().mockRejectedValue(invalid),
      vi.fn(),
    )).rejects.toBe(invalid);

    const remove = vi.fn().mockRejectedValue(locked);
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(retryPrecompiledRouteBrowserProfileCleanup(remove, wait, 2)).rejects.toBe(locked);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
});
