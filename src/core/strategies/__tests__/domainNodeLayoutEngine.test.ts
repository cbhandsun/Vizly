import { describe, expect, it } from 'vitest';
import { resolveDomainNodeLayoutAlgorithm } from '../domainNodeLayoutEngine';

describe('resolveDomainNodeLayoutAlgorithm', () => {
  it('maps legacy Cytoscape modes to equivalent ELK algorithms', () => {
    expect(resolveDomainNodeLayoutAlgorithm('CytoscapeFcoseLayout', 'layered')).toBe('force');
    expect(resolveDomainNodeLayoutAlgorithm('fcose', 'stress')).toBe('force');
    expect(resolveDomainNodeLayoutAlgorithm('cytoscape-concentric', 'layered')).toBe('radial');
  });

  it('preserves an explicitly configured ELK algorithm for standard layouts', () => {
    expect(resolveDomainNodeLayoutAlgorithm('elk', 'stress')).toBe('stress');
    expect(resolveDomainNodeLayoutAlgorithm(undefined, 'org.eclipse.elk.mrtree')).toBe(
      'org.eclipse.elk.mrtree',
    );
  });

  it('pins the explicit orthogonal layered layout to ELK layered', () => {
    expect(resolveDomainNodeLayoutAlgorithm('elk-layered', 'stress')).toBe('layered');
    expect(resolveDomainNodeLayoutAlgorithm('ELK_LAYERED', 'force')).toBe('layered');
  });

  it('falls back safely for empty and non-string boundary values', () => {
    expect(resolveDomainNodeLayoutAlgorithm('', '')).toBe('layered');
    expect(resolveDomainNodeLayoutAlgorithm({ mode: 'fcose' }, Number.NaN)).toBe('layered');
  });
});
