import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Exercise the real PostgreSQL owner boundary without granting platform ownership. */
export function runRealtimePolicyDatabaseRegression(docker, container, template) {
  const component = readFileSync(new URL('../../supabase/database-paths/components/backend-topics.sql', import.meta.url), 'utf8');
  const reader = 'vizly_policy_fixture_migrator';
  const owner = 'vizly_policy_fixture_owner';
  const sql = (db, input) => docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1'], { input });
  sql('postgres', `CREATE ROLE ${reader} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
    CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;`);
  const clone = (from, to) => docker(['exec', container, 'createdb', '-U', 'postgres', '-T', from, to]);
  const snapshot = db => sql(db, `SELECT jsonb_build_object('owner',c.relowner::regrole::text,'rls',c.relrowsecurity,
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),
    'rows',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM realtime.messages m))
    FROM pg_catalog.pg_class c WHERE c.oid='realtime.messages'::regclass;`);
  const apply = db => sql(db, `BEGIN; SET SESSION AUTHORIZATION ${reader};
    DO $fixture$ BEGIN IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
      OR pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='realtime.messages'::regclass),'USAGE')
      THEN RAISE EXCEPTION 'Fixture unexpectedly owns platform messages'; END IF; END $fixture$;
    ${component} COMMIT;`);
  clone(template, 'topic_policy_base');
  sql('topic_policy_base', `ALTER TABLE realtime.messages OWNER TO ${owner};
    GRANT USAGE ON SCHEMA realtime TO ${reader},${owner};
    CREATE POLICY unrelated_permissive ON realtime.messages FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
    GRANT SELECT,INSERT ON realtime.messages TO anon,authenticated;
    INSERT INTO realtime.messages(topic) VALUES ('public-topic'),('vizly-backend:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`);
  const original = snapshot('topic_policy_base');
  const legacy = readFileSync(new URL('../../supabase/migrations/20261009160720_private_backend_room_topics.sql', import.meta.url), 'utf8');
  assert.throws(() => sql('topic_policy_base', `BEGIN; SET SESSION AUTHORIZATION ${reader}; ${legacy} COMMIT;`), /must be owner of relation messages/);
  assert.equal(snapshot('topic_policy_base'), original);
  apply('topic_policy_base');
  assert.equal(snapshot('topic_policy_base'), original);
  apply('topic_policy_base');
  assert.equal(snapshot('topic_policy_base'), original);
  const scenarios = ['platform-owned exact policy is reused twice by a non-owner non-superuser without changing owner, policy OID, definitions or rows'];
  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql('topic_policy_base', `SET ROLE ${role}; SELECT count(*) FROM realtime.messages WHERE topic LIKE 'vizly-backend:%';`).trim().split('\n').at(-1), '0');
    assert.equal(sql('topic_policy_base', `SET ROLE ${role}; SELECT count(*) FROM realtime.messages WHERE topic='public-topic';`).trim().split('\n').at(-1), '1');
  }
  scenarios.push('required restrictive policy still fences backend topics from both browser roles despite an unrelated broad permissive policy');
  clone(template, 'topic_policy_partition');
  sql('topic_policy_partition', `DROP TABLE realtime.messages;
    CREATE TABLE realtime.messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,topic text) PARTITION BY RANGE(id);
    CREATE TABLE realtime.messages_default PARTITION OF realtime.messages DEFAULT;
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    BEGIN; ${component} COMMIT;
    ALTER TABLE realtime.messages OWNER TO ${owner};
    GRANT USAGE ON SCHEMA realtime TO ${reader};`);
  const partitionBefore = snapshot('topic_policy_partition');
  apply('topic_policy_partition');
  assert.equal(snapshot('topic_policy_partition'), partitionBefore);
  scenarios.push('Supabase-style partitioned messages table retains the exact platform-owned policy under a non-owner role');
  const policy = (suffix, using = "topic IS NOT NULL AND topic !~ '^vizly-backend:'", check = using) =>
    `DROP POLICY vizly_backend_topics_deny_clients ON realtime.messages;
     CREATE POLICY vizly_backend_topics_deny_clients ON realtime.messages ${suffix} USING (${using}) WITH CHECK (${check});`;
  for (const [name, mutation, expected] of [
    ['missing', 'DROP POLICY vizly_backend_topics_deny_clients ON realtime.messages;', 'Backend realtime policy missing'],
    ['permissive', policy('AS PERMISSIVE FOR ALL TO anon,authenticated'), 'Backend realtime policy differs'],
    ['roles', policy('AS RESTRICTIVE FOR ALL TO authenticated'), 'Backend realtime policy differs'],
    ['command', "DROP POLICY vizly_backend_topics_deny_clients ON realtime.messages; CREATE POLICY vizly_backend_topics_deny_clients ON realtime.messages AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(topic IS NOT NULL AND topic !~ '^vizly-backend:');", 'Backend realtime policy differs'],
    ['using', policy('AS RESTRICTIVE FOR ALL TO anon,authenticated', 'true'), 'Backend realtime policy differs'],
    ['check', policy('AS RESTRICTIVE FOR ALL TO anon,authenticated', undefined, 'true'), 'Backend realtime policy differs'],
    ['rls_disabled', 'ALTER TABLE realtime.messages DISABLE ROW LEVEL SECURITY;', 'Unsupported realtime messages shape or disabled RLS'],
  ]) {
    const db = `topic_policy_${name}`;
    clone('topic_policy_base', db); sql(db, mutation);
    const before = snapshot(db);
    assert.throws(() => apply(db), error => error instanceof Error && error.message.includes(expected));
    assert.equal(snapshot(db), before);
    scenarios.push(`${name}: explicit refusal under real non-owner boundary, with zero committed platform-policy or data changes`);
  }
  clone('topic_policy_base', 'topic_policy_owner_install');
  sql('topic_policy_owner_install', 'DROP POLICY vizly_backend_topics_deny_clients ON realtime.messages;');
  sql('topic_policy_owner_install', `BEGIN; SET SESSION AUTHORIZATION ${owner}; ${component} COMMIT;`);
  assert.equal(sql('topic_policy_owner_install', "SELECT NOT polpermissive FROM pg_policy WHERE polrelid='realtime.messages'::regclass AND polname='vizly_backend_topics_deny_clients';").trim(), 't');
  scenarios.push('an authorized owner still installs the missing restrictive policy on a new environment');
  return scenarios;
}
