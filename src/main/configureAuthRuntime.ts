import { getAuthSessionRevision } from '@/context/authSessionBoundary';
import { configureAuthSensitiveRuntime } from '@/context/authSensitiveRuntime';

configureAuthSensitiveRuntime({
  clearSensitiveRuntimeState: async (userId, options) => {
    const revision = getAuthSessionRevision();
    const [{ clearRuntimeAIConfig }, { CryptoService }] = await Promise.all([
      import('@/components/ai/aiConfigStorage'),
      import('@vizly/core/security'),
    ]);
    if (getAuthSessionRevision() !== revision) return;
    clearRuntimeAIConfig(userId);
    if (options?.removeLocalSecret) {
      CryptoService.clearUserSecret(userId);
    } else {
      CryptoService.clearKeyCache();
    }
  },
});
