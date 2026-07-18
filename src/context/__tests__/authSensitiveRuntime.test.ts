import { describe, expect, it, vi } from 'vitest';

import {
  clearAuthSensitiveRuntimeState,
  configureAuthSensitiveRuntime,
} from '../authSensitiveRuntime';

describe('auth sensitive runtime port', () => {
  it('normalizes an empty user id to a no-op', async () => {
    const clearSensitiveRuntimeState = vi.fn();
    configureAuthSensitiveRuntime({ clearSensitiveRuntimeState });

    await clearAuthSensitiveRuntimeState('');

    expect(clearSensitiveRuntimeState).not.toHaveBeenCalled();
  });

  it('forwards an explicit secret-removal request to the configured adapter', async () => {
    const clearSensitiveRuntimeState = vi.fn().mockResolvedValue(undefined);
    configureAuthSensitiveRuntime({ clearSensitiveRuntimeState });

    await clearAuthSensitiveRuntimeState('user-1', { removeLocalSecret: true });

    expect(clearSensitiveRuntimeState).toHaveBeenCalledWith('user-1', { removeLocalSecret: true });
  });
});
