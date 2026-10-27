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
  return [...report.cases, 'server-only-schema-and-invoker-rpcs', 'contended-writer-fails-without-mutation',
    'independent-concurrent-writers-preserve-budget-and-acknowledgments'];
}
