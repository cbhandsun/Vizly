import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = new URL('../supabase/database-paths/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const quote = value => `'${value.replaceAll("'", "''")}'`;
export function renderDatabasePath(mode) {
  if (!['empty', 'upgrade', 'inventory'].includes(mode)) throw new Error('Usage: node scripts/database-path.mjs empty|upgrade|inventory > plan.sql');
  if (mode === 'inventory') return read('inventory.sql');
  const manifest = JSON.parse(read('manifest.json'));
  const files = mode === 'empty' ? [manifest.baseline, ...manifest.forwardChain] : manifest.forwardChain;
  const known = [...Object.keys(manifest.historicalFiles), manifest.baseline, ...manifest.forwardChain].map(name => name.split('_')[0]);
  const steps = files.map(name => {
    if (!/^\d{14}_[a-z_]+\.sql$/.test(name)) throw new Error('Invalid migration path');
    const sql = read(`migrations/${name}`);
    const digest = createHash('sha256').update(sql).digest('hex');
    // No SQL from users, network or database data is interpolated here.
    if (sql.includes('$vizly_body$')) throw new Error('Reserved migration delimiter');
    return `DO $step$
DECLARE installed text;
BEGIN
  SELECT sha256 INTO installed FROM vizly_migrations.applied WHERE name=${quote(name)};
  IF FOUND THEN
    IF installed<>${quote(digest)} THEN RAISE EXCEPTION 'Applied migration checksum mismatch'; END IF;
    RETURN;
  END IF;
  EXECUTE $vizly_body$${sql}$vizly_body$;
  INSERT INTO vizly_migrations.applied(name,sha256) VALUES (${quote(name)},${quote(digest)});
END $step$;`;
  });
  return `-- Generated transaction; run with psql -X -v ON_ERROR_STOP=1 -f plan.sql.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('vizly-database-path-v1',0));
CREATE SCHEMA IF NOT EXISTS vizly_migrations;
REVOKE ALL ON SCHEMA vizly_migrations FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS vizly_migrations.applied(name text PRIMARY KEY,sha256 text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE vizly_migrations.applied ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vizly_migrations.applied FROM PUBLIC,anon,authenticated,service_role;
DO $history$
DECLARE unknown_count bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $query$SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version::text NOT IN (${known.map(quote).join(',')})$query$ INTO unknown_count;
    IF unknown_count>0 THEN RAISE EXCEPTION 'Unknown Supabase migration history; reconcile inventory before upgrade'; END IF;
  END IF;
END $history$;
${steps.join('\n')}
COMMIT;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(renderDatabasePath(process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
