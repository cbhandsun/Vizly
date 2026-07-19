import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultRoutingConfig } from '../../../types/routing';
import {
  getWorkerRoutingModules,
  resetWorkerRoutingModuleCacheForTests,
} from '../edgeRoutingWorkerModules';

describe('edgeRoutingWorkerModules', () => {
  afterEach(resetWorkerRoutingModuleCacheForTests);

  it('reuses modules for the same unchanged configuration object', () => {
    const config = createDefaultRoutingConfig();
    const first = getWorkerRoutingModules(config);
    const second = getWorkerRoutingModules(config);
    expect(second).toBe(first);
  });

  it('does not share modules between separately owned config objects', () => {
    const first = getWorkerRoutingModules(createDefaultRoutingConfig());
    expect(getWorkerRoutingModules(createDefaultRoutingConfig())).not.toBe(first);
  });

  it('invalidates modules when behavior-affecting configuration changes', () => {
    const config = createDefaultRoutingConfig();
    const first = getWorkerRoutingModules(config);
    config.costs.normal += 1;
    const costChanged = getWorkerRoutingModules(config);
    expect(costChanged).not.toBe(first);

    config.bus.spacing += 1;
    expect(getWorkerRoutingModules(config)).not.toBe(costChanged);
  });
});
