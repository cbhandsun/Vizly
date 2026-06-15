import { describe, expect, it } from 'vitest';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import { ConfigIntegration } from '../ConfigIntegration';

const createIntegration = () => new ConfigIntegration(diagramConfigManager, {
  enableMigration: false,
  preserveExistingConfig: true,
  enableValidation: true,
  enablePerformanceOptimization: false,
  migrationStrategy: 'manual',
});

describe('ConfigIntegration', () => {
  it('rejects non-object integrated config imports', async () => {
    const integration = createIntegration();

    await expect(integration.importIntegratedConfig('not an object')).rejects.toThrow('must be an object');

    integration.dispose();
  });

  it('rejects malformed presets before importing a theme package', async () => {
    const integration = createIntegration();

    await expect(integration.importIntegratedConfig({ presets: 'not-array' })).rejects.toThrow('presets must be an array');

    integration.dispose();
  });
});
