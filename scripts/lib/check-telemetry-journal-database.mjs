import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

/** Called only for an owned Docker database fixture, never a configured cloud URL. */
export async function runTelemetryJournalDatabaseRegression(docker, container, database) {
  assert.match(container, /^vizly-rls-regression-\d+$/);
  assert.match(database, /^(empty|legacy_text|existing_uuid)_telemetry$/);
  const argv = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'];
  const sql = input => docker(argv, { input });
  const fixture = readFileSync(new URL('../fixtures/telemetry-journal/regression.sql', import.meta.url), 'utf8');
  const output = sql("SET vizly.telemetry_fixture='owned-isolated-postgres';\n" + fixture);
  const report = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(report.status, 'passed'); assert.equal(report.suite, 'telemetry-journal-sql');
  assert.equal(report.cases.length, 11);
  const roleChecks = sql(`SELECT has_schema_privilege('anon','vizly_telemetry','USAGE')::int,
    has_schema_privilege('authenticated','vizly_telemetry','USAGE')::int,
    has_function_privilege('anon','public.vizly_record_telemetry(jsonb)','EXECUTE')::int,
    has_function_privilege('authenticated','public.vizly_query_telemetry(text,uuid)','EXECUTE')::int;
    SELECT count(*) FROM pg_proc WHERE proname IN ('vizly_record_telemetry','vizly_query_telemetry') AND NOT prosecdef;`);
  assert.equal(roleChecks.trim(), '0|0|0|0\n2');

  // Independent PostgreSQL sessions contend for the same real transaction lock.
  const lock = spawn('docker', argv, { stdio: ['pipe', 'pipe', 'pipe'] });
  lock.stdin.on('error', () => {});
  const lockDeadline = setTimeout(() => lock.kill('SIGTERM'), 10000);
  lock.once('close', () => clearTimeout(lockDeadline));
  let stderr = '';
  lock.stderr.on('data', data => { stderr = (stderr + data).slice(-2048); });
  const finished = new Promise(resolve => {
    lock.once('error', error => resolve({ code: -1, error }));
    lock.once('close', code => resolve({ code }));
  });
  try {
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Owned lock fixture did not become ready')), 5000);
      let text = '';
      lock.stdout.on('data', data => {
        text = (text + data).slice(-1024);
        if (text.includes('VIZLY_TELEMETRY_LOCKED')) { clearTimeout(timeout); resolve(); }
      });
      lock.once('close', () => { clearTimeout(timeout); reject(Error('Owned lock fixture exited before readiness')); });
      lock.once('error', error => { clearTimeout(timeout); reject(error); });
    });
    lock.stdin.write("BEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('vizly-telemetry-journal-v1',0));\n\\echo VIZLY_TELEMETRY_LOCKED\n");
    await ready;
    const before = sql('SELECT count(*) FROM vizly_telemetry.journal;');
    assert.throws(() => sql(`SET ROLE service_role;SELECT public.vizly_record_telemetry(
      (SELECT jsonb_set(batch,'{sequence}','10000'::jsonb) FROM vizly_telemetry.journal LIMIT 1));`), /lock timeout/);
    assert.equal(sql('SELECT count(*) FROM vizly_telemetry.journal;'), before);
  } finally {
    lock.stdin.end('ROLLBACK;\n');
    const result = await finished;
    assert.equal(result.code, 0, `Owned lock fixture failed: ${stderr}`);
  }
  // Every writer has an independent role/session. Busy writers may fail closed.
  const writes = await Promise.all(Array.from({ length: 8 }, (_, index) => new Promise(resolve => {
    const child = spawn('docker', argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    const deadline = setTimeout(() => child.kill('SIGTERM'), 10000);
    child.once('close', () => clearTimeout(deadline));
    let out = '', error = '';
    child.stdout.on('data', data => { out += data; });
    child.stderr.on('data', data => { error += data; });
    child.once('error', problem => resolve({ code: -1, error: problem.message }));
    child.once('close', code => resolve({ code, out: out.trim(), error }));
    child.stdin.end(`SET ROLE service_role;SELECT public.vizly_record_telemetry(
      (SELECT jsonb_set(batch,'{sequence}','${11000 + index}'::jsonb) FROM vizly_telemetry.journal WHERE sequence=9000));`);
  })));
  const accepted = writes.filter(write => write.code === 0);
  assert.ok(accepted.length > 0);
  for (const write of writes) {
    if (write.code === 0) assert.deepEqual(JSON.parse(write.out), { accepted: true, stored: true });
    else assert.match(write.error, /lock timeout/);
  }
  assert.equal(Number(sql('SELECT count(*) FROM vizly_telemetry.journal WHERE sequence>=11000;')), accepted.length);
  assert.equal(sql('SELECT count(*)<=1000 AND sum(payload_bytes)<=4194304 FROM vizly_telemetry.journal;').trim(), 't');
  // Actual PostgreSQL roles, cooldown boundaries, global rate budget and concurrent admission.
  const claim = (op, code, id = '11111111-1111-4111-8111-111111111111', release = 'a'.repeat(40)) =>
    `SELECT public.vizly_claim_telemetry_alert('${release}','${op}','${code}','${id}');`;
  assert.equal(sql(`SELECT has_function_privilege('anon','public.vizly_claim_telemetry_alert(text,text,text,uuid)','EXECUTE'),
    has_function_privilege('authenticated','public.vizly_claim_telemetry_alert(text,text,text,uuid)','EXECUTE'),
    has_table_privilege('anon','vizly_telemetry.alert_claims','SELECT'),
    (SELECT NOT prosecdef FROM pg_proc WHERE proname='vizly_claim_telemetry_alert');`).trim(), 'f|f|f|t');
  assert.equal(sql('SET ROLE service_role;' + claim('permission', 'denied')).trim(), 't');
  assert.equal(sql('SET ROLE service_role;' + claim('permission', 'denied', '22222222-2222-4222-8222-222222222222', 'b'.repeat(40))).trim(), 'f');
  sql("UPDATE vizly_telemetry.alert_claims SET claimed_at=clock_timestamp()-interval '11 minutes';");
  assert.equal(sql('SET ROLE service_role;' + claim('permission', 'denied')).trim(), 'f');
  assert.equal(sql('SET ROLE service_role;' + claim('permission', 'denied', '22222222-2222-4222-8222-222222222222')).trim(), 't');
  for (const op of ['startup', 'save', 'connect', 'reconnect', 'lease']) assert.equal(sql('SET ROLE service_role;' + claim(op, 'network')).trim(), 't');
  assert.equal(sql('SET ROLE service_role;' + claim('export', 'network')).trim(), 'f');
  assert.equal(sql('SELECT count(*) FROM vizly_telemetry.alert_claims;').trim(), '6');
  sql("UPDATE vizly_telemetry.alert_claims SET claimed_at=clock_timestamp()-interval '11 minutes';");
  const admissions = await Promise.all(Array.from({ length: 8 }, () => new Promise(resolve => {
    const child = spawn('docker', argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    const deadline = setTimeout(() => child.kill('SIGTERM'), 10000);
    let out = '', error = '';
    child.stdout.on('data', data => { out += data; }); child.stderr.on('data', data => { error += data; });
    child.once('error', problem => { clearTimeout(deadline); resolve({ code: -1, error: problem.message }); });
    child.once('close', code => { clearTimeout(deadline); resolve({ code, out: out.trim(), error }); });
    child.stdin.end('SET ROLE service_role;' + claim('export', 'network'));
  })));
  assert.equal(admissions.filter(x => x.code === 0 && x.out === 't').length, 1);
  assert.ok(admissions.every(x => x.code === 0 && ['t','f'].includes(x.out)));
  assert.equal(sql(`SELECT has_function_privilege('anon','public.vizly_record_incident_telemetry(jsonb,text)','EXECUTE'),
    has_function_privilege('authenticated','public.vizly_record_incident_telemetry(jsonb,text)','EXECUTE'),
    has_table_privilege('anon','vizly_telemetry.incidents','SELECT'),
    (SELECT NOT prosecdef FROM pg_proc WHERE proname='vizly_record_incident_telemetry');`).trim(), 'f|f|f|t');
  const incidentBatch = (sequence, outcome, source = 'server', releaseId = 'a'.repeat(40)) => {
    const operation = 'lease';
    const requestId = `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}`;
    const metrics = Object.fromEntries(['startup','save','connect','reconnect','permission','cas','lease','export','route']
      .map(key => [key, { started: 1, success: 0, failure: 0, cancelled: 0 }]));
    metrics[operation][outcome] = 1;
    const batch = { schema: 'vizly-telemetry-v1', releaseId, streamId: '22222222-2222-4222-8222-222222222222',
      sequence, dropped: 0, metrics, events: [{ schema: 'vizly-operation-v1', releaseId, requestId, operation,
        outcome, code: outcome === 'success' ? null : 'timeout', durationMs: 8 }] };
    return `SET ROLE service_role; SELECT jsonb_array_length(public.vizly_record_incident_telemetry(
      '${JSON.stringify(batch)}','${source}')->'notifications');`;
  };
  assert.equal(sql(incidentBatch(12001, 'failure')).trim(), '1');
  assert.equal(sql(incidentBatch(12001, 'failure')).trim(), '0');
  assert.equal(sql(incidentBatch(12002, 'success')).trim(), '0');
  sql("UPDATE vizly_telemetry.incidents SET last_failure_at=clock_timestamp()-interval '20 minutes';");
  assert.equal(sql(incidentBatch(12003, 'failure', 'server', 'b'.repeat(40))).trim(), '0');
  sql("UPDATE vizly_telemetry.incidents SET last_failure_at=clock_timestamp()-interval '2 minutes';");
  assert.equal(sql(incidentBatch(12004, 'success', 'browser')).trim(), '0');
  assert.equal(sql("SELECT resolved_at IS NULL FROM vizly_telemetry.incidents WHERE source='server';").trim(), 't');
  assert.equal(sql(incidentBatch(12005, 'success')).trim(), '0');
  assert.equal(sql("SELECT resolved_at IS NOT NULL FROM vizly_telemetry.incidents WHERE source='server';").trim(), 't');
  assert.equal(sql(incidentBatch(12006, 'failure')).trim(), '1');
  return [...report.cases, 'server-only-schema-and-invoker-rpcs', 'contended-writer-fails-without-mutation',
    'independent-concurrent-writers-preserve-budget-and-acknowledgments',
    'alert-rpc-role-isolation', 'alert-cross-release-cooldown-and-replay', 'alert-global-rate-budget', 'alert-concurrent-single-admission',
    'incident-deduplication-across-releases-and-recovery', 'incident-recovery-producer-isolation'];
}
