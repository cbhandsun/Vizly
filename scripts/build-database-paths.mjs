import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../supabase/database-paths/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const historical = name => {
  const text = readFileSync(new URL(`../migrations/${name}`, root), 'utf8');
  if (sha(text) !== manifest.historicalFiles[name]) throw new Error(`Historical migration changed: ${name}`);
  // Reviewed historical files contain only these top-level transaction markers.
  // Preserve the original files. The new path owns one outer transaction.
  return text.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gim, '');
};
const component = name => readFileSync(new URL(`components/${name}.sql`, root), 'utf8');
const policies = new Map();
for (const name of Object.keys(manifest.historicalFiles)) {
  for (const match of historical(name).matchAll(/DROP POLICY IF EXISTS ("[^"]+"|\w+)\s+ON public\.(\w+)/gi)) {
    const key = match[2]; if (!policies.has(key)) policies.set(key, new Set());
    policies.get(key).add(match[1].replaceAll('"', ''));
  }
}
for (const [table, names] of Object.entries({
  ai_conversations: ['Users can manage their own conversations'], user_configs: ['owner_all'],
  diagram_versions: ['Enable all read access', 'Enable all insert access', 'Enable all update access', 'Enable all delete access'],
})) { if (!policies.has(table)) policies.set(table, new Set()); for (const name of names) policies.get(table).add(name); }
const quote = value => `'${value.replaceAll("'", "''")}'`;
const expected = `CREATE TEMP TABLE vizly_expected_policies(table_name text,policy_name text) ON COMMIT DROP;\nINSERT INTO vizly_expected_policies VALUES\n${[...policies].flatMap(([table, names]) => [...names].map(name => `(${quote(table)},${quote(name)})`)).join(',\n')};\n`;
const header = '-- Generated from reviewed components and hash-pinned historical definitions.\n-- Apply only through scripts/database-path.mjs inside its single transaction.\n';
const forward = [header, expected, component('preflight'), component('normalize'),
  historical('20260611000000_harden_rls_policies.sql'),
  'DROP POLICY "Users can read permitted diagram versions" ON public.diagram_versions;\nDROP POLICY "Users can insert own diagram versions" ON public.diagram_versions;\n',
  historical('20261008202340_harden_diagram_version_permissions.sql'),
  component('grants'),
  historical('20261008054418_revoke_explicit_anonymous_collaborator_rpc_grants.sql'),
  historical('20261009014315_harden_system_template_permissions.sql'),
  historical('20261009160702_collaboration_atomic_room_store.sql'),
  historical('20261009160720_private_backend_room_topics.sql'),
  historical('20261009171828_optimize_rls_identity_indexes.sql'),
  historical('20261009172905_remove_duplicate_collaborator_unique.sql'),
  component('postflight')].join('\n');
const extensions = Object.entries(manifest.extensionFiles ?? {}).map(([name, digest]) => {
  if (!/^\d{14}_[a-z_]+\.sql$/.test(name) || !manifest.forwardChain.includes(name)) throw new Error('Invalid extension migration');
  const source = readFileSync(new URL(`../migrations/${name}`, root), 'utf8');
  if (sha(source) !== digest) throw new Error(`Extension migration changed: ${name}`);
  // Never silently adopt an independently installed/private schema. A matching
  // path receipt skips this entire step; otherwise inventory must be reconciled.
  const guard = `DO $extension_guard$ BEGIN
    IF to_regnamespace('vizly_ai') IS NOT NULL THEN
      RAISE EXCEPTION 'AI resource schema exists without a matching path receipt; reconcile inventory';
    END IF;
  END $extension_guard$;\n`;
  return [name, header + guard + source.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gim, '')];
});
for (const [name, contents] of [[manifest.baseline, header + component('tables')], [manifest.forward, forward], ...extensions]) {
  const url = new URL(`migrations/${name}`, root);
  if (process.argv.includes('--check')) {
    if (readFileSync(url, 'utf8') !== contents) throw new Error(`Regenerate database path: ${name}`);
  } else writeFileSync(url, contents);
}
console.log(process.argv.includes('--check') ? 'Database paths match reviewed sources' : 'Database paths generated; historical migrations unchanged');
