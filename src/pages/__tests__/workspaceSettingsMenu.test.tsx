import { describe, expect, it } from 'vitest';

import { createWorkspaceSettingsMenu } from '../workspaceSettingsMenu';

const readableLabels = (items: ReturnType<typeof createWorkspaceSettingsMenu>): string[] =>
  (items ?? []).flatMap(item => (
    item && 'label' in item && typeof item.label === 'string' ? [item.label] : []
  ));

describe('createWorkspaceSettingsMenu', () => {
  it('uses customer-facing storage and account language', () => {
    const items = createWorkspaceSettingsMenu({
      accountLabel: 'Sign in',
      isAuthenticated: false,
      storageSettingsLabel: 'Storage and sync',
    });

    const labels = readableLabels(items);
    expect(labels).toEqual(['Storage and sync', 'Sign in']);
    expect(labels.join(' ')).not.toMatch(/S3|Supabase/i);
  });

  it('shows the provided signed-in account label without provider terminology', () => {
    const items = createWorkspaceSettingsMenu({
      accountLabel: 'Signed in as user@example.com',
      isAuthenticated: true,
      storageSettingsLabel: 'Storage and sync',
    });

    expect(readableLabels(items)).toContain('Signed in as user@example.com');
  });
});
