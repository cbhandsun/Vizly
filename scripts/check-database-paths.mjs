import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderDatabasePath } from './database-path.mjs';
import { waitForIsolatedPostgres } from './lib/isolatedPostgresReadiness.mjs';
import { runVersionOutboxDatabaseRegression } from './lib/check-version-outbox-database.mjs';
import { runTelemetryJournalDatabaseRegression } from './lib/check-telemetry-journal-database.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const image = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
export async function runDatabasePathRegression() {
  const container = `vizly-rls-regression-${process.pid}`;
  const docker = (args, options = {}) => {
    const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options });
    if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr?.toString() ?? 'Docker failed');
    return r.stdout;
  };
  const sql = (db, input) => docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1'], { input });
  const fail = (db, input, pattern) => {
    const r = spawnSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'], { input,encoding:'utf8',timeout:120_000,maxBuffer:16*1024*1024 });
    assert.notEqual(r.status,0); assert.match(r.stderr,pattern);
  };
  const fingerprint = db => sql(db, `SELECT jsonb_object_agg(name,digest ORDER BY name) FROM (${['diagrams','diagram_collaborators','shared_diagrams','diagram_versions','system_templates','user_configs','ai_conversations'].map(name =>
    `SELECT '${name}' name,md5(coalesce(string_agg(md5((${name === 'diagram_versions' ? "(to_jsonb(t)-'diagram_id')||jsonb_build_object('diagram_id',lower(t.diagram_id::text))" : 'to_jsonb(t)'})::text),'' ORDER BY md5((${name === 'diagram_versions' ? "(to_jsonb(t)-'diagram_id')||jsonb_build_object('diagram_id',lower(t.diagram_id::text))" : 'to_jsonb(t)'})::text)),'')) digest FROM public.${name} t`).join(' UNION ALL ')} ) rows;`).trim();
  const inventory = db => sql(db, renderDatabasePath('inventory'));
  const clone = (from, to) => docker(['exec',container,'createdb','-U','postgres','-T',from,to]);
  const scenarios = [];
  let started = false;
  try {
    docker(['run','--detach','--name',container,'--network','none','--cpus','2','--memory','2g','--pids-limit','256',
      '--tmpfs','/var/lib/postgresql/data:rw,size=1073741824','--env','POSTGRES_HOST_AUTH_METHOD=trust',image]); started = true;
    await waitForIsolatedPostgres({container,probe:args=>spawnSync('docker',args,{encoding:'utf8',timeout:5000})});
    sql('postgres','CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    const platform = read('./fixtures/database-paths/platform.sql');
    const seed = read('./fixtures/database-paths/seed.sql');
    const permissions = read('./fixtures/database-paths/permissions.sql');
    const manifest = JSON.parse(read('../supabase/database-paths/manifest.json'));
    const tables = read(`../supabase/database-paths/migrations/${manifest.baseline}`);
    const upgrade = renderDatabasePath('upgrade');
    for (const kind of ['empty','legacy_text','existing_uuid']) {
      docker(['exec',container,'createdb','-U','postgres',kind]);
      sql(kind,platform);
      if (kind==='empty') {
        sql(kind,renderDatabasePath('empty')); sql(kind,seed);
      } else {
        sql(kind,`BEGIN;${tables}${seed}COMMIT;`);
        if (kind==='legacy_text') sql(kind,`DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.diagram_versions'::regclass AND contype='f' LOOP EXECUTE format('ALTER TABLE public.diagram_versions DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
          ALTER TABLE public.diagram_versions ALTER COLUMN diagram_id TYPE text USING diagram_id::text;
          UPDATE public.diagram_versions SET diagram_id=upper(diagram_id);
          CREATE POLICY "Enable all read access" ON public.diagram_versions FOR SELECT USING(true);`);
        else sql(kind,'CREATE POLICY "Enable all insert access" ON public.diagram_versions FOR INSERT WITH CHECK(true);');
        sql(kind,`GRANT ALL ON public.diagram_versions TO anon,authenticated;
          CREATE POLICY owner_all ON public.user_configs FOR ALL USING(auth.uid()=user_id);
          CREATE POLICY "Users can manage their own conversations" ON public.ai_conversations FOR ALL USING(auth.uid()=user_id);
          INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20260414000000','historical',['preserved-history']::text[]);`.replace("['preserved-history']", "ARRAY['preserved-history']"));
        clone(kind,`${kind}_before`);
        const before = fingerprint(kind); const history = sql(kind,'TABLE supabase_migrations.schema_migrations;');
        sql(kind,upgrade);
        assert.equal(fingerprint(kind),before); assert.equal(sql(kind,'TABLE supabase_migrations.schema_migrations;'),history);
        if (kind==='legacy_text') assert.equal(sql(kind,"SELECT count(*) FROM vizly_migrations.version_reference_map WHERE original_diagram_id=upper(canonical_diagram_id::text);").trim(),'2');
        scenarios.push(`${kind}: row counts/content digests, references, original ID map and history preserved`);
      }
      sql(kind,permissions);
      assert.equal(sql(kind,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='vizly_ai' AND c.relkind='r' AND c.relrowsecurity;").trim(),'3');
      assert.equal(sql(kind,"SELECT count(*) FROM pg_proc WHERE proname IN ('vizly_acquire_ai_lease','vizly_release_ai_lease') AND NOT prosecdef;").trim(),'2');
      scenarios.push(`${kind}: AI admission tables, RLS and invoker RPCs installed`);
      assert.equal(sql(kind,"SET ROLE service_role;SELECT public.vizly_acquire_ai_lease('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'admitted';").trim().split('\n').at(-1),'true');
      assert.equal(sql(kind,"SET ROLE service_role;SELECT public.vizly_release_ai_lease('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');").trim().split('\n').at(-1),'t');
      for (const role of ['anon','authenticated']) {
        fail(kind,`SET ROLE ${role};SELECT public.vizly_acquire_ai_lease('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');`,/permission denied/);
        fail(kind,`SET ROLE ${role};TABLE vizly_ai.request_lease;`,/permission denied/);
      }
      scenarios.push(`${kind}: backend AI acquire/release works and anonymous/user access is denied`);
      const beforeRepeat = inventory(kind); sql(kind,upgrade); assert.equal(inventory(kind),beforeRepeat);
      scenarios.push(`${kind}: owner/editor/viewer/anonymous/admin permissions and same-hash repeat`);
      // Keep the original migration/backup fixtures unchanged for later assertions.
      clone(kind, `${kind}_outbox`);
      scenarios.push(await runVersionOutboxDatabaseRegression(docker, container, `${kind}_outbox`));
      clone(kind, `${kind}_telemetry`);
      scenarios.push(...(await runTelemetryJournalDatabaseRegression(docker, container, `${kind}_telemetry`))
        .map(result => `${kind}: telemetry ${result}`));
    }
    // Non-empty input cannot accidentally enter the new-install path.
    const populated = inventory('existing_uuid_before');
    fail('existing_uuid_before',renderDatabasePath('empty'),/Baseline requires an empty application schema/);
    assert.equal(inventory('existing_uuid_before'),populated); scenarios.push('empty baseline refuses populated databases atomically');
    const badCases = [
      ['invalid_id',"UPDATE public.diagram_versions SET diagram_id='old-template-id' WHERE message='Historical snapshot';",/Invalid historical diagram version IDs/],
      ['orphan',"UPDATE public.diagram_versions SET diagram_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' WHERE message='Historical snapshot';",/Orphan version references/],
      ['unknown_policy','CREATE POLICY unexpected_allow ON public.diagrams FOR ALL USING(true);',/Unknown application policy/],
      ['unknown_history',"INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('19990101000000');",/Unknown Supabase migration history/],
      ['wrong_index','CREATE INDEX diagram_versions_diagram_created_id_idx ON public.diagram_versions(id);',/Version history index shape mismatch/],
      ['unknown_shape','ALTER TABLE public.user_configs ALTER COLUMN user_id TYPE text USING user_id::text;',/Unsupported column/],
    ];
    for (const [name, mutation, reason] of badCases) {
      clone('legacy_text_before',name);
      // Type mutation needs to remove its fixture FK/policy; no production CASCADE.
      if (name==='unknown_shape') {
        sql(name,'DROP POLICY owner_all ON public.user_configs; ALTER TABLE public.user_configs DROP CONSTRAINT user_configs_user_id_fkey;');
      }
      sql(name,mutation); const before = inventory(name); const data = fingerprint(name);
      fail(name,upgrade,reason); assert.equal(inventory(name),before); assert.equal(fingerprint(name),data);
      scenarios.push(`${name}: explicit failure and zero committed schema/data changes`);
    }
    clone('existing_uuid','deployed_complete');
    sql('deployed_complete',`DROP FUNCTION public.vizly_acquire_ai_lease(uuid,uuid),public.vizly_release_ai_lease(uuid,uuid);
      DROP TABLE vizly_ai.request_lease,vizly_ai.user_window,vizly_ai.resource_policy; DROP SCHEMA vizly_ai;
      DROP FUNCTION public.vizly_record_telemetry(jsonb),public.vizly_query_telemetry(text,uuid);
      DROP TABLE vizly_telemetry.journal;
      DROP FUNCTION vizly_telemetry.project_batch(jsonb),vizly_telemetry.valid_counter(jsonb); DROP SCHEMA vizly_telemetry;
      DROP TABLE vizly_migrations.applied,vizly_migrations.version_reference_map; DROP SCHEMA vizly_migrations;
      INSERT INTO vizly_collaboration.room_state VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,decode('0102','hex'));
      INSERT INTO vizly_collaboration.recovery_backup VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',encode(sha256(decode('0102','hex')),'hex'),'cccccccc-cccc-4ccc-8ccc-cccccccccccc',decode('0102','hex'));
    `);
    const roomBefore=sql('deployed_complete','TABLE vizly_collaboration.room_state; TABLE vizly_collaboration.recovery_backup;');
    const completeBefore=fingerprint('deployed_complete');
    sql('deployed_complete',upgrade); sql('deployed_complete',permissions);
    assert.equal(fingerprint('deployed_complete'),completeBefore);
    assert.equal(sql('deployed_complete','TABLE vizly_collaboration.room_state; TABLE vizly_collaboration.recovery_backup;'),roomBefore);
    scenarios.push('already hardened UUID deployment preserves existing collaboration state/backups and permissions');
    // A prior path installation must append the new step without rewriting old receipts.
    clone('existing_uuid','prior_path_ai_upgrade');
    sql('prior_path_ai_upgrade',`DROP FUNCTION public.vizly_acquire_ai_lease(uuid,uuid),public.vizly_release_ai_lease(uuid,uuid);
      DROP TABLE vizly_ai.request_lease,vizly_ai.user_window,vizly_ai.resource_policy; DROP SCHEMA vizly_ai;
      DELETE FROM vizly_migrations.applied WHERE name='20261026191139_ai_gateway_shared_resource_leases.sql';`);
    const oldReceipts=sql('prior_path_ai_upgrade','SELECT name,sha256 FROM vizly_migrations.applied ORDER BY name;');
    const oldData=fingerprint('prior_path_ai_upgrade');
    sql('prior_path_ai_upgrade',upgrade);
    assert.equal(fingerprint('prior_path_ai_upgrade'),oldData);
    assert.equal(sql('prior_path_ai_upgrade',"SELECT name,sha256 FROM vizly_migrations.applied WHERE name<>'20261026191139_ai_gateway_shared_resource_leases.sql' ORDER BY name;"),oldReceipts);
    scenarios.push('prior path appends AI step while preserving old receipts and business data');
    clone('existing_uuid','ai_without_receipt');
    sql('ai_without_receipt',"DELETE FROM vizly_migrations.applied WHERE name='20261026191139_ai_gateway_shared_resource_leases.sql';");
    const untrackedAI=inventory('ai_without_receipt');
    fail('ai_without_receipt',upgrade,/AI resource schema exists without a matching path receipt/);
    assert.equal(inventory('ai_without_receipt'),untrackedAI);
    scenarios.push('unreceipted AI schema fails without mutation');
    clone('prior_path_ai_upgrade','ai_state_repeat');
    sql('ai_state_repeat',`INSERT INTO vizly_ai.user_window VALUES ('11111111-1111-4111-8111-111111111111',clock_timestamp(),7)
        ON CONFLICT (user_id) DO UPDATE SET admitted_requests=7;
      INSERT INTO vizly_ai.request_lease VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111',clock_timestamp()+interval '150 seconds');
      UPDATE vizly_ai.resource_policy SET requests_per_minute=35;`);
    const aiState=sql('ai_state_repeat','TABLE vizly_ai.resource_policy;TABLE vizly_ai.user_window;TABLE vizly_ai.request_lease;');
    sql('ai_state_repeat',upgrade);
    assert.equal(sql('ai_state_repeat','TABLE vizly_ai.resource_policy;TABLE vizly_ai.user_window;TABLE vizly_ai.request_lease;'),aiState);
    scenarios.push('same receipt preserves active AI leases, counters and customized policy');
    clone('existing_uuid','prior_path_telemetry_upgrade');
    sql('prior_path_telemetry_upgrade',`DROP FUNCTION public.vizly_record_telemetry(jsonb),public.vizly_query_telemetry(text,uuid);
      DROP TABLE vizly_telemetry.journal;
      DROP FUNCTION vizly_telemetry.project_batch(jsonb),vizly_telemetry.valid_counter(jsonb); DROP SCHEMA vizly_telemetry;
      DELETE FROM vizly_migrations.applied WHERE name='20261027211956_bounded_telemetry_journal.sql';`);
    clone('prior_path_telemetry_upgrade','prior_path_telemetry_before');
    const telemetryPriorReceipts=sql('prior_path_telemetry_upgrade','SELECT name,sha256 FROM vizly_migrations.applied ORDER BY name;');
    const telemetryPriorData=fingerprint('prior_path_telemetry_upgrade');
    const telemetryPriorAI=sql('prior_path_telemetry_upgrade','TABLE vizly_ai.resource_policy;TABLE vizly_ai.user_window;TABLE vizly_ai.request_lease;');
    sql('prior_path_telemetry_upgrade',upgrade);
    assert.equal(fingerprint('prior_path_telemetry_upgrade'),telemetryPriorData);
    assert.equal(sql('prior_path_telemetry_upgrade',"SELECT name,sha256 FROM vizly_migrations.applied WHERE name<>'20261027211956_bounded_telemetry_journal.sql' ORDER BY name;"),telemetryPriorReceipts);
    assert.equal(sql('prior_path_telemetry_upgrade','TABLE vizly_ai.resource_policy;TABLE vizly_ai.user_window;TABLE vizly_ai.request_lease;'),telemetryPriorAI);
    assert.equal(sql('prior_path_telemetry_upgrade',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='vizly_telemetry' AND c.relname='journal' AND c.relrowsecurity;").trim(),'1');
    scenarios.push('prior path appends telemetry without changing old receipts, business data or AI state');
    clone('existing_uuid','telemetry_without_receipt');
    sql('telemetry_without_receipt',"DELETE FROM vizly_migrations.applied WHERE name='20261027211956_bounded_telemetry_journal.sql';");
    const untrackedTelemetry=inventory('telemetry_without_receipt');
    fail('telemetry_without_receipt',upgrade,/Telemetry journal schema exists without a matching path receipt/);
    assert.equal(inventory('telemetry_without_receipt'),untrackedTelemetry);
    scenarios.push('unreceipted telemetry schema fails without mutation');
    const journalFingerprint=() => sql('empty_telemetry',"SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY release_id,stream_id,sequence),'[]'::jsonb)::text) FROM vizly_telemetry.journal t;");
    const journalBeforeRepeat=journalFingerprint();
    sql('empty_telemetry',upgrade);assert.equal(journalFingerprint(),journalBeforeRepeat);
    scenarios.push('same receipt preserves existing telemetry payloads and receive times');
    const telemetryBeforeFailure=inventory('prior_path_telemetry_before');
    const telemetryFailureMarker='create table vizly_telemetry.journal (';
    assert.ok(upgrade.includes(telemetryFailureMarker));
    fail('prior_path_telemetry_before',upgrade.replace(telemetryFailureMarker,
      "DO $telemetry_fault$ BEGIN RAISE EXCEPTION 'injected telemetry extension failure'; END $telemetry_fault$;\n"+telemetryFailureMarker),/injected telemetry extension failure/);
    assert.equal(inventory('prior_path_telemetry_before'),telemetryBeforeFailure);
    scenarios.push('telemetry extension failure rolls back schema, functions, privileges and receipt');
    clone('existing_uuid_before','conversation_uuid');
    sql('conversation_uuid',"UPDATE public.ai_conversations SET id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; ALTER TABLE public.ai_conversations ALTER COLUMN id TYPE uuid USING id::uuid;");
    const convBefore=fingerprint('conversation_uuid');sql('conversation_uuid',upgrade);
    assert.equal(fingerprint('conversation_uuid'),convBefore);
    assert.equal(sql('conversation_uuid',"SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_conversations' AND column_name='id';").trim(),'text');
    scenarios.push('UUID conversation IDs widen to TEXT without changing serialized IDs/content');
    clone('legacy_text_before','mid_failure');
    const midBefore=inventory('mid_failure');const midData=fingerprint('mid_failure');
    const marker='CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx';
    assert.ok(upgrade.includes(marker));
    fail('mid_failure',upgrade.replace(marker,"DO $fault$ BEGIN RAISE EXCEPTION 'injected mid-migration failure'; END $fault$;\n"+marker),/injected mid-migration failure/);
    assert.equal(inventory('mid_failure'),midBefore);assert.equal(fingerprint('mid_failure'),midData);
    scenarios.push('mid-migration failure rolls back type conversion, mapping, functions, grants, policies and ledger');
    // Real custom-format backup and restore into another empty DB, before/after upgrade.
    for (const source of ['legacy_text_before','existing_uuid']) {
      const backup = docker(['exec',container,'pg_dump','-U','postgres','-Fc',source],{encoding:null});
      const target = `${source}_restored`;
      docker(['exec',container,'createdb','-U','postgres',target]);
      docker(['exec','-i',container,'pg_restore','-U','postgres','--exit-on-error','-d',target],{input:backup,encoding:null});
      assert.equal(fingerprint(target),fingerprint(source)); assert.equal(inventory(target),inventory(source));
      sql(target,upgrade); sql(target,permissions);
      scenarios.push(`${source}: pg_dump/pg_restore reproduces data/schema/grants/history and passes upgrade/permissions`);
    }
    clone('existing_uuid','tampered_receipt');
    sql('tampered_receipt',"UPDATE vizly_migrations.applied SET sha256=repeat('0',64);");
    const receiptBefore=inventory('tampered_receipt');
    fail('tampered_receipt',upgrade,/Applied migration checksum mismatch/);
    assert.equal(inventory('tampered_receipt'),receiptBefore);scenarios.push('applied-file checksum mismatch fails without mutation');
    console.log(JSON.stringify({status:'passed',suite:'database-paths',postgresImage:image,scenarios}));
    return scenarios;
  } finally { if (started) docker(['rm','--force',container]); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await runDatabasePathRegression();
