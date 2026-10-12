SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM realtime.messages) <> 1 THEN RAISE EXCEPTION 'anon private-topic read denial failed'; END IF;
  BEGIN INSERT INTO realtime.messages(topic) VALUES ('vizly-backend:v1:denied'); RAISE EXCEPTION 'anon private-topic insertion accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO realtime.messages(topic) VALUES ('user-room:anon');
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT FROM realtime.messages WHERE topic LIKE 'vizly-backend:%') THEN RAISE EXCEPTION 'authenticated private-topic read accepted'; END IF;
  BEGIN INSERT INTO realtime.messages(topic) VALUES ('vizly-backend:v1:denied'); RAISE EXCEPTION 'authenticated private-topic insertion accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO realtime.messages(topic) VALUES (NULL); RAISE EXCEPTION 'null private-topic insertion accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE realtime.messages SET topic = 'vizly-backend:v1:denied' WHERE topic = 'user-room:original'; RAISE EXCEPTION 'public-to-private reassignment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE realtime.messages SET topic = 'changed' WHERE topic LIKE 'vizly-backend:%';
  DELETE FROM realtime.messages WHERE topic LIKE 'vizly-backend:%';
  INSERT INTO realtime.messages(topic) VALUES ('user-room:authenticated');
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  IF (SELECT count(*) FROM realtime.messages WHERE topic LIKE 'vizly-backend:%') <> 1 THEN RAISE EXCEPTION 'service read or client hidden update/delete invariant failed'; END IF;
  INSERT INTO realtime.messages(topic) VALUES ('vizly-backend:v1:service');
  UPDATE realtime.messages SET topic = 'vizly-backend:v1:updated' WHERE topic = 'vizly-backend:v1:service';
  DELETE FROM realtime.messages WHERE topic = 'vizly-backend:v1:updated';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policy WHERE polname = 'vizly_backend_topics_deny_clients' AND NOT polpermissive) <> 1 THEN RAISE EXCEPTION 'restrictive policy missing'; END IF;
  IF (SELECT count(*) FROM realtime.messages WHERE topic LIKE 'user-room:%') <> 3 THEN RAISE EXCEPTION 'unrelated public-topic permission changed'; END IF;
END $$;
