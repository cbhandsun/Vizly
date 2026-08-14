import { describe, expect, it } from 'vitest';

import {
  createWorkspaceFilterSearchUpdate,
  resolveWorkspaceFilterView,
} from '../workspaceFilterRoute';

describe('workspaceFilterRoute', () => {
  it.each([
    'recent',
    'local',
    'cloud',
    'shared',
    'templates',
    'general_templates',
  ])('resolves the supported %s route view', view => {
    expect(resolveWorkspaceFilterView(new URLSearchParams(`view=${view}`), null)).toBe(view);
  });

  it.each([
    null,
    '',
    'unknown',
    'LOCAL',
    '<script>alert(1)</script>',
    'x'.repeat(5000),
  ])('falls back to Recent for missing, malformed, unsafe, or extreme route input %#', view => {
    const searchParams = new URLSearchParams();
    if (view !== null) searchParams.set('view', view);
    expect(resolveWorkspaceFilterView(searchParams, null)).toBe('recent');
  });

  it('reads a bounded hash fallback when the router has no view parameter', () => {
    expect(resolveWorkspaceFilterView(new URLSearchParams(), {
      search: '',
      hash: '#/manage?view=shared&provider=s3',
    })).toBe('shared');
  });

  it('preserves unrelated parameters while producing a canonical view parameter', () => {
    const update = createWorkspaceFilterSearchUpdate(
      new URLSearchParams('provider=s3&returnTo=%2Fdiagram%2F123'),
      'general_templates',
    );

    expect(update.changed).toBe(true);
    expect(update.searchParams.get('provider')).toBe('s3');
    expect(update.searchParams.get('returnTo')).toBe('/diagram/123');
    expect(update.searchParams.get('view')).toBe('general_templates');
  });

  it('omits the default Recent view and canonicalizes invalid values', () => {
    const recent = createWorkspaceFilterSearchUpdate(
      new URLSearchParams('provider=supabase&view=local'),
      'recent',
    );
    expect(recent.searchParams.toString()).toBe('provider=supabase');

    const invalid = createWorkspaceFilterSearchUpdate(
      new URLSearchParams('provider=supabase&view=local'),
      'not-a-view',
    );
    expect(invalid.searchParams.toString()).toBe('provider=supabase');
  });

  it('does not create a duplicate history entry for the same canonical selection', () => {
    expect(createWorkspaceFilterSearchUpdate(
      new URLSearchParams('provider=s3&view=cloud'),
      'cloud',
    ).changed).toBe(false);
    expect(createWorkspaceFilterSearchUpdate(
      new URLSearchParams('provider=s3'),
      'recent',
    ).changed).toBe(false);
  });
});
