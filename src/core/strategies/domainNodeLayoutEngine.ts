const normalizeLayoutName = (value: unknown): string =>
  typeof value === 'string'
    ? value.toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '')
    : '';

export const resolveDomainNodeLayoutAlgorithm = (
  requestedLayout: unknown,
  configuredAlgorithm: unknown,
): string => {
  const requested = normalizeLayoutName(requestedLayout);
  if (requested === 'elklayered') return 'layered';
  if (requested.includes('concentric')) return 'radial';
  if (requested.includes('cytoscape') || requested.includes('fcose')) return 'force';

  const configured = typeof configuredAlgorithm === 'string'
    ? configuredAlgorithm.trim().toLowerCase()
    : '';
  return configured || 'layered';
};
