DO $verify$
DECLARE item record; expression text; actual_count bigint; actual_digest text; qualified_name text;
BEGIN
  FOR item IN SELECT * FROM vizly_rows_before LOOP
    expression := CASE WHEN item.table_name='diagram_versions' THEN '(to_jsonb(t) - ''diagram_id'') || jsonb_build_object(''diagram_id'',t.diagram_id::uuid::text)' ELSE 'to_jsonb(t)' END;
    qualified_name := CASE WHEN item.table_name LIKE 'vizly_collaboration.%' THEN format('vizly_collaboration.%I',split_part(item.table_name,'.',2)) ELSE format('public.%I',item.table_name) END;
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(row_hash,'''' ORDER BY row_hash),'''')) FROM (SELECT md5((%s)::text) row_hash FROM %s t) rows',expression,qualified_name) INTO actual_count,actual_digest;
    IF actual_count<>item.row_count OR actual_digest<>item.digest THEN
      RAISE EXCEPTION 'Migration changed business rows in %; transaction rolled back',item.table_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM vizly_rows_before) AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Missing application RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.diagram_versions v LEFT JOIN public.diagrams d ON d.id=v.diagram_id WHERE d.id IS NULL) THEN
    RAISE EXCEPTION 'Version references changed during upgrade';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) role(name)
    WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM vizly_rows_before)
    AND (has_table_privilege(role.name,c.oid,'TRUNCATE') OR has_table_privilege(role.name,c.oid,'TRIGGER')
      OR has_table_privilege(role.name,c.oid,'REFERENCES'))) THEN
    RAISE EXCEPTION 'Excessive application table grants';
  END IF;
END $verify$;

DO $index_guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.diagram_versions_diagram_created_id_idx')
    AND i.indrelid='public.diagram_versions'::regclass AND i.indisvalid AND i.indisready
    AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=3 AND i.indnatts=3
    AND i.indoption::text='0 3 0'
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)=ARRAY['diagram_id','created_at','id']) THEN
    RAISE EXCEPTION 'Version history index shape mismatch';
  END IF;
END $index_guard$;
