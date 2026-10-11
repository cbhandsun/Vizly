import { readFileSync } from 'node:fs';

const deniedInsert = `DO $$ BEGIN
  BEGIN INSERT INTO public.system_templates VALUES('forbidden','fixture','{}',true);
  RAISE EXCEPTION 'Forbidden insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;`;
const deniedTruncate = `DO $$ BEGIN
  BEGIN TRUNCATE public.system_templates;
  RAISE EXCEPTION 'Forbidden truncate succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;`;
const ordinaryAssertions = (claims, role = 'authenticated') => `BEGIN; SET LOCAL ROLE ${role};
  SELECT set_config('request.jwt.claims','${JSON.stringify(claims)}',true);
  SELECT public.assert_template((SELECT count(*) FROM public.system_templates)=1,'active-only reads');
  ${deniedInsert}
  WITH changed AS (UPDATE public.system_templates SET title='forbidden' RETURNING id)
  SELECT public.assert_template((SELECT count(*) FROM changed)=0,'ordinary update denied');
  WITH changed AS (DELETE FROM public.system_templates RETURNING id)
  SELECT public.assert_template((SELECT count(*) FROM changed)=0,'ordinary delete denied');
  ${deniedTruncate} ROLLBACK;`;

// Separate database; share only the roles in the already-owned isolated cluster.
export function runTemplatePermissionRlsRegression(runDocker, container) {
  const database = 'vizly_template_boundary';
  const sql = input => runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], { input, maxBuffer: 4 * 1024 * 1024 });
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database]);
  sql(readFileSync(new URL('../fixtures/template-permissions-bootstrap.sql', import.meta.url), 'utf8'));
  sql(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
    WITH changed AS (UPDATE public.system_templates SET title='old-policy-proof' WHERE id='inactive' RETURNING id)
    SELECT public.assert_template((SELECT count(*) FROM changed)=1,'old policy permits unauthorized update'); ROLLBACK;`);
  const migration = readFileSync(new URL('../../supabase/migrations/20261009014315_harden_system_template_permissions.sql', import.meta.url), 'utf8');
  sql(migration); sql(migration);
  const ordinaryClaims = [
    {}, { role: 'authenticated' }, { role: 'authenticated', user_metadata: { role: 'admin' } },
    { role: 'authenticated', app_metadata: { role: 'user' } }, { role: 'authenticated', app_metadata: null },
    { role: 'authenticated', app_metadata: { role: ['admin'] } }, { role: 'authenticated', app_metadata: { role: 'ADMIN' } },
    { role: 'authenticated', is_anonymous: true },
  ];
  for (const claims of ordinaryClaims) sql(ordinaryAssertions(claims));
  sql(ordinaryAssertions({ app_metadata: { role: 'admin' } }, 'anon'));
  sql(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
    SELECT public.assert_template((SELECT count(*) FROM public.system_templates)=2,'admin reads inactive');
    INSERT INTO public.system_templates VALUES('admin-created','fixture','{}',false);
    WITH changed AS (UPDATE public.system_templates SET title='admin-edit' WHERE id='admin-created' RETURNING id)
    SELECT public.assert_template((SELECT count(*) FROM changed)=1,'admin update');
    WITH changed AS (DELETE FROM public.system_templates WHERE id='admin-created' RETURNING id)
    SELECT public.assert_template((SELECT count(*) FROM changed)=1,'admin delete');
    ${deniedTruncate} ROLLBACK;`);
  sql(`BEGIN; SET LOCAL ROLE service_role;
    SELECT public.assert_template((SELECT count(*) FROM public.system_templates)=2,'service reads');
    INSERT INTO public.system_templates VALUES('service-created','fixture','{}',false);
    TRUNCATE public.system_templates; ROLLBACK;
    SELECT public.assert_template((SELECT count(*) FROM public.system_templates)=2,'rollback retains data');`);
}
