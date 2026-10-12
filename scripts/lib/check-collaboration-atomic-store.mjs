import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export async function runCollaborationAtomicStoreRegression(runDocker, container) {
  const database = 'vizly_atomic_room_boundary';
  const read = name => readFileSync(new URL('../fixtures/' + name, import.meta.url), 'utf8');
  const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-qAt'];
  const sql = input => runDocker(args, { input, maxBuffer: 8 * 1024 * 1024 });
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database]);
  const bootstrap = read('rls-bootstrap.sql').replace(/^CREATE ROLE (?:anon|authenticated);\r?$/gm, '');
  const roles = "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;";
  const draft = readFileSync(new URL('../../supabase/migrations/20261009160702_collaboration_atomic_room_store.sql', import.meta.url), 'utf8');
  const legacy = 'CREATE FUNCTION public.vizly_exchange_atomic_room(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$; '
    + 'GRANT EXECUTE ON FUNCTION public.vizly_exchange_atomic_room(uuid,uuid,text,text) TO service_role;';
  sql(roles + '\n' + bootstrap + '\n' + legacy + '\n' + draft + '\n' + draft + '\n' + read('collaboration-atomic-store-assertions.sql'));
  const exchange = "select public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2', 'BQY=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');";
  let firstAcquired;
  const acquired = new Promise(resolve => { firstAcquired = resolve; });
  const asyncSql = (input, first = false, held = false) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Atomic SQL regression timed out')); }, 15000);
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (first && output.split(/\r?\n/).includes('t')) firstAcquired();
      });
      child.stderr.on('data', chunk => { error += chunk.toString(); });
      child.stdin.on('error', cause => { clearTimeout(timer); reject(cause); });
      child.once('error', cause => { clearTimeout(timer); reject(cause); });
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(error || 'Atomic SQL failed')); });
    });
    if (held) child.stdin.write(input + '\n'); else child.stdin.end(input);
    return { result, finish: statement => child.stdin.end(statement + '\n'), abort: () => child.kill() };
  };
  const winner = asyncSql("set application_name = 'vizly_cas_winner'; begin; set role service_role;\n" + exchange, true, true);
  let loser;
  // Observe real contention before releasing the transaction. A timed sleep
  // does not prove overlap and can outlive the RPC lock budget on a busy host.
  try {
    await Promise.race([acquired, winner.result.then(() => { throw new Error('First CAS did not acquire the row'); })]);
    loser = asyncSql("set application_name = 'vizly_cas_loser'; set role service_role;\n" + exchange);
    const observe = asyncSql(`DO $$ DECLARE deadline timestamptz := clock_timestamp() + interval '2 seconds'; BEGIN
      LOOP
        EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND application_name = 'vizly_cas_loser' AND wait_event_type = 'Lock'
          AND wait_event = 'advisory' AND cardinality(pg_blocking_pids(pid)) > 0);
        IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'Concurrent CAS lock overlap not observed'; END IF;
        PERFORM pg_sleep(0.01);
      END LOOP;
    END $$;`);
    // Retain all failures rather than abandon a rejected child promise.
    const inspected = await Promise.allSettled([observe.result, Promise.race([
      observe.result, loser.result.then(() => { throw new Error('Second CAS completed before lock overlap'); }),
    ])]);
    const inspectionFailure = inspected.find(result => result.status === 'rejected');
    if (inspectionFailure) throw inspectionFailure.reason;
    winner.finish('commit;');
    const [won, lost] = await Promise.all([winner.result, loser.result]);
    if (won !== 't' || lost !== 'f') throw new Error('Concurrent stale CAS did not reject exactly one writer');
  } finally {
    winner.abort(); loser?.abort();
    await Promise.allSettled([winner.result, ...(loser ? [loser.result] : [])]);
  }
  const persisted = sql("set role service_role; select public.vizly_read_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'version';").trim();
  if (persisted !== '3') throw new Error('Concurrent CAS changed durable version incorrectly');
  sql(read('collaboration-room-leases-assertions.sql'));
}
