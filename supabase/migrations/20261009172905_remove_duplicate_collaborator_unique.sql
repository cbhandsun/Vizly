BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.diagram_collaborators IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE
  primary_constraint pg_constraint%ROWTYPE;
  duplicate_constraint pg_constraint%ROWTYPE;
  primary_index pg_index%ROWTYPE;
  duplicate_index pg_index%ROWTYPE;
BEGIN
  SELECT * INTO primary_constraint FROM pg_constraint
    WHERE conrelid = 'public.diagram_collaborators'::regclass AND contype = 'p';
  IF NOT FOUND OR primary_constraint.condeferrable OR NOT primary_constraint.convalidated
    OR (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
      FROM unnest(primary_constraint.conkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = primary_constraint.conrelid AND a.attnum = k.attnum)
      IS DISTINCT FROM ARRAY['diagram_id','user_id']::text[] THEN
    RAISE EXCEPTION 'Collaborator primary key shape mismatch';
  END IF;
  SELECT * INTO primary_index FROM pg_index WHERE indexrelid = primary_constraint.conindid;
  IF NOT FOUND OR NOT primary_index.indisvalid OR NOT primary_index.indisready
    OR NOT primary_index.indisunique OR primary_index.indpred IS NOT NULL
    OR primary_index.indexprs IS NOT NULL OR primary_index.indnatts <> 2 THEN
    RAISE EXCEPTION 'Collaborator primary index invalid';
  END IF;
  SELECT * INTO duplicate_constraint FROM pg_constraint
    WHERE conrelid = primary_constraint.conrelid
      AND conname = 'diagram_collaborators_diagram_id_user_id_key';
  IF NOT FOUND THEN
    IF to_regclass('public.diagram_collaborators_diagram_id_user_id_key') IS NOT NULL THEN
      RAISE EXCEPTION 'Collaborator duplicate constraint shape mismatch';
    END IF;
    RETURN;
  END IF;
  IF duplicate_constraint.contype <> 'u' OR duplicate_constraint.condeferrable
    OR NOT duplicate_constraint.convalidated
    OR duplicate_constraint.conkey IS DISTINCT FROM primary_constraint.conkey THEN
    RAISE EXCEPTION 'Collaborator duplicate constraint shape mismatch';
  END IF;
  SELECT * INTO duplicate_index FROM pg_index WHERE indexrelid = duplicate_constraint.conindid;
  IF NOT FOUND OR NOT duplicate_index.indisvalid OR NOT duplicate_index.indisready
    OR NOT duplicate_index.indisunique OR duplicate_index.indisreplident OR duplicate_index.indisclustered
    OR duplicate_index.indpred IS NOT NULL OR duplicate_index.indexprs IS NOT NULL
    OR duplicate_index.indnatts IS DISTINCT FROM primary_index.indnatts
    OR duplicate_index.indkey IS DISTINCT FROM primary_index.indkey
    OR duplicate_index.indclass IS DISTINCT FROM primary_index.indclass
    OR duplicate_index.indcollation IS DISTINCT FROM primary_index.indcollation
    OR duplicate_index.indoption IS DISTINCT FROM primary_index.indoption
    OR duplicate_index.indnullsnotdistinct IS DISTINCT FROM primary_index.indnullsnotdistinct THEN
    RAISE EXCEPTION 'Collaborator duplicate index shape mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_class'::regclass
      AND refobjid = duplicate_constraint.conindid)
    OR EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_constraint'::regclass
      AND refobjid = duplicate_constraint.oid
      AND NOT (classid = 'pg_class'::regclass AND objid = duplicate_constraint.conindid AND deptype = 'i'))
    OR EXISTS (SELECT 1 FROM pg_proc WHERE prokind IN ('f','p')
      AND position('diagram_collaborators_diagram_id_user_id_key' in prosrc) > 0) THEN
    RAISE EXCEPTION 'Collaborator duplicate constraint has dependencies';
  END IF;
  ALTER TABLE public.diagram_collaborators
    DROP CONSTRAINT diagram_collaborators_diagram_id_user_id_key;
END
$guard$;
COMMIT;
