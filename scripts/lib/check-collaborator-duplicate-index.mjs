import { readFileSync } from 'node:fs';

export function runCollaboratorDuplicateIndexRegression(runDocker, container) {
  const database = 'vizly_duplicate_collaborator_index';
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const sql = input => runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-qAt'], { input, maxBuffer: 4 * 1024 * 1024 });
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database]);
  const migration = read('../../supabase/migrations/20261009172905_remove_duplicate_collaborator_unique.sql');
  const add = 'ALTER TABLE public.diagram_collaborators ADD CONSTRAINT diagram_collaborators_diagram_id_user_id_key UNIQUE(diagram_id,user_id);';
  sql('CREATE TABLE public.diagram_collaborators(diagram_id uuid,user_id uuid,PRIMARY KEY(diagram_id,user_id));' + add);
  sql(migration); sql(migration);
  sql('DROP TABLE public.diagram_collaborators;');
  sql(read('../fixtures/rls-bootstrap.sql').replace(/^CREATE ROLE (?:anon|authenticated);\r?$/gm, '')
    + read('../../supabase/migrations/20260611000000_harden_rls_policies.sql')
    + read('../../supabase/migrations/20261008054418_revoke_explicit_anonymous_collaborator_rpc_grants.sql') + add);
  sql("INSERT INTO public.diagram_collaborators VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','viewer','22222222-2222-4222-8222-222222222222',now());");
  const snapshot = () => sql(`SELECT jsonb_build_object('rows',(SELECT jsonb_agg(to_jsonb(c) ORDER BY diagram_id,user_id) FROM public.diagram_collaborators c),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='diagram_collaborators'),
    'grants',(SELECT relacl FROM pg_class WHERE oid='public.diagram_collaborators'::regclass));`);
  const before = snapshot();
  sql(migration); sql(migration);
  if (snapshot() !== before) throw new Error('Duplicate index migration changed rows, policies or grants');
  sql("SELECT public.assert_rls(to_regclass('public.diagram_collaborators_diagram_id_user_id_key') IS NULL,'duplicate index removed');");
  sql('BEGIN;\n' + read('../fixtures/rls-assertions.sql') + '\nROLLBACK;');
  sql(`DO $$ BEGIN
    BEGIN INSERT INTO public.diagram_collaborators SELECT * FROM public.diagram_collaborators LIMIT 1;
      RAISE EXCEPTION 'Duplicate membership admitted'; EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN INSERT INTO public.diagram_collaborators(diagram_id,user_id) VALUES(NULL,NULL);
      RAISE EXCEPTION 'Null membership admitted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
    END $$;`);
  const rejected = message => {
    let matched = false;
    try { sql(migration); } catch (error) {
      if (!(error instanceof Error) || !error.message.includes(message)) throw error;
      matched = true;
    }
    if (!matched) throw new Error('Unsafe duplicate index migration was admitted');
    sql("SELECT public.assert_rls(to_regclass('public.diagram_collaborators_diagram_id_user_id_key') IS NOT NULL,'rejected migration retains index');");
  };
  sql('ALTER TABLE public.diagram_collaborators ADD CONSTRAINT diagram_collaborators_diagram_id_user_id_key UNIQUE(user_id,diagram_id);');
  rejected('Collaborator duplicate constraint shape mismatch');
  sql('ALTER TABLE public.diagram_collaborators DROP CONSTRAINT diagram_collaborators_diagram_id_user_id_key;'
    + 'ALTER TABLE public.diagram_collaborators ADD CONSTRAINT diagram_collaborators_diagram_id_user_id_key UNIQUE(diagram_id,user_id) DEFERRABLE;');
  rejected('Collaborator duplicate constraint shape mismatch');
  sql('ALTER TABLE public.diagram_collaborators DROP CONSTRAINT diagram_collaborators_diagram_id_user_id_key;' + add);
  sql(`ALTER TABLE public.diagram_collaborators DROP CONSTRAINT diagram_collaborators_pkey;
    CREATE TABLE public.dependent_membership(diagram_id uuid,user_id uuid,FOREIGN KEY(diagram_id,user_id) REFERENCES public.diagram_collaborators(diagram_id,user_id));
    ALTER TABLE public.diagram_collaborators ADD PRIMARY KEY(diagram_id,user_id);`);
  rejected('Collaborator duplicate constraint has dependencies');
  sql('DROP TABLE public.dependent_membership;');
  sql(`CREATE FUNCTION public.named_constraint_reference() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    INSERT INTO public.diagram_collaborators(diagram_id,user_id) VALUES(NULL,NULL)
      ON CONFLICT ON CONSTRAINT diagram_collaborators_diagram_id_user_id_key DO NOTHING;
    END $$;`);
  rejected('Collaborator duplicate constraint has dependencies');
  sql('DROP FUNCTION public.named_constraint_reference();');
  sql('ALTER TABLE public.diagram_collaborators REPLICA IDENTITY USING INDEX diagram_collaborators_diagram_id_user_id_key;');
  rejected('Collaborator duplicate index shape mismatch');
  sql('ALTER TABLE public.diagram_collaborators REPLICA IDENTITY DEFAULT;');
  sql('ALTER TABLE public.diagram_collaborators DROP CONSTRAINT diagram_collaborators_pkey;');
  rejected('Collaborator primary key shape mismatch');
  sql('ALTER TABLE public.diagram_collaborators ADD PRIMARY KEY(user_id,diagram_id);');
  rejected('Collaborator primary key shape mismatch');
  sql('ALTER TABLE public.diagram_collaborators DROP CONSTRAINT diagram_collaborators_pkey;'
    + 'ALTER TABLE public.diagram_collaborators ADD PRIMARY KEY(diagram_id,user_id);');
  sql(migration);
  if (snapshot() !== before) throw new Error('Rejected duplicate migration changed rows, policies or grants');
  sql('CREATE UNIQUE INDEX diagram_collaborators_diagram_id_user_id_key ON public.diagram_collaborators(diagram_id,user_id);');
  rejected('Collaborator duplicate constraint shape mismatch');
  sql('DROP INDEX public.diagram_collaborators_diagram_id_user_id_key;');
  sql(migration);
}
