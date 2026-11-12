import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Exercise the installed schema's primary key and RLS, without adding a test-only API.
export async function runVersionOutboxDatabaseRegression(runDocker, container, database) {
  const owner = '11111111-1111-4111-8111-111111111111';
  const outsider = '22222222-2222-4222-8222-222222222222';
  const viewer = '33333333-3333-4333-8333-333333333333';
  const editor = '44444444-4444-4444-8444-444444444444';
  const diagram = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const operation = 'cccccccc-0000-4000-8000-000000000001';
  const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const sql = input => runDocker(args, { input, maxBuffer: 1024 * 1024 });
  const auth = user => `SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`;
  const insert = (id, user = owner, message = 'original') => `INSERT INTO public.diagram_versions(id,diagram_id,author_id,snapshot_data,message) VALUES ('${id}','${diagram}','${user}','{"nodes":[{"id":"node"}],"edges":[]}','${message}');`;
  const rejected = (input, state) => {
    assert.throws(() => sql(input), error => error instanceof Error && error.message.includes(state));
  };
  sql(auth(owner) + insert(operation));
  // Commit succeeded, response lost: replay cannot create or overwrite a second row.
  rejected(auth(owner) + insert(operation), '23505');
  rejected(auth(owner) + insert(operation, owner, 'conflicting-content'), '23505');
  rejected(auth(owner) + `UPDATE public.diagram_versions SET message='tamper' WHERE id='${operation}';`, '42501');
  rejected(auth(owner) + `DELETE FROM public.diagram_versions WHERE id='${operation}';`, '42501');
  assert.equal(sql(auth(owner) + `SELECT count(*) || ':' || min(message) FROM public.diagram_versions WHERE id='${operation}' AND diagram_id='${diagram}' AND author_id='${owner}';`).trim(), '1:original');
  assert.equal(sql(auth(outsider) + `SELECT count(*) FROM public.diagram_versions WHERE id='${operation}';`).trim(), '0');
  rejected(auth(outsider) + insert('cccccccc-0000-4000-8000-000000000002', outsider), '42501');
  rejected(auth(viewer) + insert('cccccccc-0000-4000-8000-000000000003', viewer), '42501');
  rejected(auth(editor) + insert('cccccccc-0000-4000-8000-000000000004', owner), '42501');
  rejected('SET ROLE anon;' + insert('cccccccc-0000-4000-8000-000000000005'), '42501');
  sql(auth(editor) + insert('cccccccc-0000-4000-8000-000000000006', editor));
  assert.equal(sql(auth(editor) + `SELECT count(*) FROM public.diagram_versions WHERE id='${operation}' AND author_id='${editor}';`).trim(), '0');
  // Even another permitted editor cannot repurpose the original account's operation ID.
  rejected(auth(editor) + insert(operation, editor, 'other-account'), '23505');

  for (const [suffix, terminal] of [['7', 'COMMIT'], ['8', 'ROLLBACK']]) {
    const id = `cccccccc-0000-4000-8000-00000000000${suffix}`;
    let acquired;
    const ready = new Promise(resolve => { acquired = resolve; });
    const start = (input, held = false) => {
      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('Outbox SQL child timed out')); }, 15_000);
        child.stdout.on('data', chunk => { stdout += chunk; if (held && stdout.split(/\r?\n/).includes('outbox-acquired')) acquired(); });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.stdin.on('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      });
      if (held) child.stdin.write(input + '\n'); else child.stdin.end(input);
      return { result, finish: () => child.stdin.end(`${terminal};\n`), abort: () => child.kill() };
    };
    const first = start(`SET application_name='vizly_outbox_first'; BEGIN; SET LOCAL statement_timeout='10s'; ${auth(owner)} ${insert(id)} SELECT 'outbox-acquired';`, true);
    let second;
    let observer;
    try {
      await Promise.race([ready, first.result.then(() => { throw new Error('First insert did not hold the transaction'); })]);
      second = start(`SET application_name='vizly_outbox_second'; SET statement_timeout='10s'; ${auth(owner)} ${insert(id, owner, 'second')}`);
      observer = start(`DO $$ DECLARE deadline timestamptz := clock_timestamp()+interval '3 seconds'; BEGIN LOOP
        PERFORM pg_stat_clear_snapshot();
        EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND application_name='vizly_outbox_second' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0);
        IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Concurrent unique-key contention not observed'; END IF;
        PERFORM pg_sleep(0.01);
      END LOOP; END $$;`);
      const observed = await observer.result;
      assert.equal(observed.code, 0, observed.stderr);
      first.finish();
      const [winner, contender] = await Promise.all([first.result, second.result]);
      assert.equal(winner.code, 0, winner.stderr);
      if (terminal === 'COMMIT') { assert.notEqual(contender.code, 0); assert.match(contender.stderr, /23505/); }
      else assert.equal(contender.code, 0, contender.stderr);
      assert.equal(sql(auth(owner) + `SELECT count(*) || ':' || min(message) FROM public.diagram_versions WHERE id='${id}';`).trim(), terminal === 'COMMIT' ? '1:original' : '1:second');
    } finally {
      first.abort(); second?.abort(); observer?.abort();
      await Promise.allSettled([first.result, ...(second ? [second.result] : []), ...(observer ? [observer.result] : [])]);
    }
  }
  return `${database}: outbox replay/content conflict, owner/editor/viewer/anonymous isolation, immutable rows, observed concurrent commit and rollback contention`;
}
