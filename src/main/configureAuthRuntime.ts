import { configureAuthSensitiveRuntime } from '@/context/authSensitiveRuntime';

configureAuthSensitiveRuntime({
  clearSensitiveRuntimeState: async (userId, options) => {
    const [{ clearRuntimeAIConfig }, { CryptoService }] = await Promise.all([
      import('@/components/ai/aiConfigStorage'),
      import('@/core/utils/CryptoService'),
    ]);
    clearRuntimeAIConfig(userId);
    if (options?.removeLocalSecret) {
      CryptoService.clearUserSecret(userId);
    } else {
      CryptoService.clearKeyCache();
    }
  },
});
