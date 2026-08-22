import { describe, expect, it } from 'vitest';

import { resolveAppRouteTarget } from '../appRouteResolver';

const resolve = (
  path: string,
  overrides: Partial<Parameters<typeof resolveAppRouteTarget>[0]> = {},
) => resolveAppRouteTarget({
  path,
  diagramId: '',
  testMode: '',
  enableDevRoutes: false,
  ...overrides,
});

describe('resolveAppRouteTarget', () => {
  it.each([
    ['/', 'manage'],
    ['', 'manage'],
    ['/manage', 'manage'],
    ['/manage/archive', 'manage'],
    ['/docs', 'docs'],
    ['/docs/keyboard', 'docs'],
    ['/warehouse-3d', 'warehouse-3d'],
    ['/storage-config', 'storage-config'],
    ['/shared/token', 'shared'],
    ['/diagram', 'diagram'],
  ])('resolves the supported path %s to %s', (path, expected) => {
    expect(resolve(path)).toBe(expected);
  });

  it('opens a diagram from a validated diagram id on the canonical root route', () => {
    expect(resolve('/', { diagramId: 'diagram-123' })).toBe('diagram');
  });

  it.each(['/missing', '/manage-evil', '/docs-preview', '/shared-link', '/%2e%2e/manage'])(
    'rejects unknown and lookalike routes instead of opening the last diagram: %s',
    (path) => {
      expect(resolve(path)).toBe('not-found');
    },
  );

  it('does not let a diagram query turn an unknown path into a viewer route', () => {
    expect(resolve('/private/customer-diagram', { diagramId: 'diagram-123' })).toBe('not-found');
  });

  it('keeps production-only test modes from opening developer pages', () => {
    expect(resolve('/', { testMode: 'colors' })).toBe('not-found');
    expect(resolve('/unified-test')).toBe('not-found');
  });

  it('allows developer-only routes when the build explicitly enables them', () => {
    expect(resolve('/', { testMode: 'colors', enableDevRoutes: true })).toBe('theme-colors');
    expect(resolve('/unified-test', { enableDevRoutes: true })).toBe('unified-test');
  });
});
