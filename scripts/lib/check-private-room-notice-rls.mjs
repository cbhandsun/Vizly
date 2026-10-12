import { readFileSync } from 'node:fs';
export function runPrivateRoomNoticeRlsRegression(runDocker, container) {
  const database = 'vizly_private_realtime_topics';
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database}`]);
  const read = name => readFileSync(new URL('../fixtures/' + name, import.meta.url), 'utf8');
  const bootstrap = `CREATE SCHEMA realtime; CREATE TABLE realtime.messages(topic text);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON realtime.messages TO anon,authenticated,service_role;
CREATE POLICY existing_broad_permissive ON realtime.messages FOR ALL TO anon,authenticated USING (true) WITH CHECK (true);
INSERT INTO realtime.messages(topic) VALUES ('vizly-backend:v1:original'),('user-room:original');`;
  const policy = readFileSync(new URL('../../supabase/migrations/20261009160720_private_backend_room_topics.sql', import.meta.url), 'utf8');
  runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-qAt'], {
    input: bootstrap + '\n' + policy + '\n' + policy + '\n' + read('private-room-notice-policy-assertions.sql'), maxBuffer: 1024 * 1024,
  });
}
