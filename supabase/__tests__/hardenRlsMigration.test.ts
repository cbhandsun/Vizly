import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260611000000_harden_rls_policies.sql'),
  'utf8'
);

describe('harden RLS migration', () => {
  it('does not trust user-editable metadata for admin template authorization', () => {
    const policyMatch = migration.match(
      /CREATE POLICY "Allow admin users to manage templates"[\s\S]*?WITH CHECK \([\s\S]*?\n\s+\);/
    );

    expect(policyMatch?.[0]).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(policyMatch?.[0]).not.toContain('user_metadata');
  });

  it('prevents collaborator updates from changing diagram ownership', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.prevent_diagram_user_id_change()');
    expect(migration).toContain('CREATE TRIGGER prevent_diagram_user_id_change');
    expect(migration).toContain('BEFORE UPDATE OF user_id ON public.diagrams');
    expect(migration).toContain('Diagram owner cannot be changed');
  });

  it('allows editor collaborators to update diagrams without requiring owner user_id takeover', () => {
    const policyMatch = migration.match(
      /CREATE POLICY "Users can update editable diagrams"[\s\S]*?WITH CHECK \([\s\S]*?\n\s+\);/
    );

    expect(policyMatch?.[0]).toContain("dc.role IN ('owner', 'editor')");
    expect(policyMatch?.[0]).toContain('dc.user_id::text = auth.uid()::text');
  });

  it('branches version history policies for owner-only and collaborator-aware schemas', () => {
    expect(migration.match(/CREATE POLICY "Users can read permitted diagram versions"/g)).toHaveLength(2);
    expect(migration.match(/CREATE POLICY "Users can insert own diagram versions"/g)).toHaveLength(2);
    expect(migration).toContain("AND dc.role IN ('owner', 'editor')");
    expect(migration).toContain('IF has_diagram_collaborators THEN');
  });

  it('does not let collaborator management modify an existing owner row', () => {
    expect(migration).toContain("IF v_existing_role = 'owner' THEN");
    expect(migration).toContain('Cannot modify diagram owner');
    expect(migration).toContain("ORDER BY CASE WHEN dc.role = 'owner' THEN 0 ELSE 1 END");
    expect(migration).toContain("AND role <> 'owner'");
  });

  it('binds share-link management to the authenticated diagram owner', () => {
    const policyMatch = migration.match(
      /CREATE POLICY "Users can manage own share links"[\s\S]*?WITH CHECK \([\s\S]*?\n\s+\);/
    );

    expect(policyMatch?.[0]).toContain('created_by::text = auth.uid()::text');
    expect(policyMatch?.[0]).toContain('FROM public.diagrams d');
    expect(policyMatch?.[0]).toContain('d.id::text = shared_diagrams.diagram_id::text');
    expect(policyMatch?.[0]).toContain('d.user_id::text = auth.uid()::text');
  });

  it('does not expose entire diagram rows through anonymous share-token RPC responses', () => {
    const functionMatch = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_shared_diagram_by_token\(p_share_token text\)[\s\S]*?LIMIT 1[\s\S]*?\$sql\$;/
    );

    expect(functionMatch?.[0]).toContain('jsonb_build_object');
    expect(functionMatch?.[0]).toContain("'content', d.content");
    expect(functionMatch?.[0]).not.toContain('to_jsonb(d)');
    expect(functionMatch?.[0]).not.toContain("'user_id', d.user_id");
  });

  it('limits collaborator email listing to diagram owners', () => {
    const functionMatch = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_diagram_collaborators\(p_diagram_id uuid\)[\s\S]*?ORDER BY[\s\S]*?\$sql\$;/
    );

    expect(functionMatch?.[0]).toContain('LEFT JOIN auth.users u');
    expect(functionMatch?.[0]).toContain('d.user_id::text = auth.uid()::text');
    expect(functionMatch?.[0]).toContain("mine.role = 'owner'");
  });
});
