INSERT INTO auth.users VALUES
('11111111-1111-4111-8111-111111111111','owner@example.invalid'),
('22222222-2222-4222-8222-222222222222','outsider@example.invalid'),
('33333333-3333-4333-8333-333333333333','viewer@example.invalid'),
('44444444-4444-4444-8444-444444444444','editor@example.invalid');
INSERT INTO public.diagrams(id,user_id,title,content) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Retain owner content','{"nodes":[{"id":"n1","label":"保留内容"}],"edges":[]}'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Other owner','{"preserve":true}');
INSERT INTO public.diagram_collaborators(diagram_id,user_id,role,added_by) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer','11111111-1111-4111-8111-111111111111'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','editor','11111111-1111-4111-8111-111111111111');
INSERT INTO public.diagram_versions(id,diagram_id,author_id,snapshot_data,message) VALUES
('aaaaaaaa-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{"nodes":[{"id":"history"}],"edges":[]}','Historical snapshot'),
('bbbbbbbb-0000-4000-8000-000000000011','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,'{"retain":true}','Legacy unknown author');
INSERT INTO public.shared_diagrams(id,diagram_id,created_by,share_token,is_active,expires_at) VALUES
('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','fixture-active',true,now()+interval '1 day'),
('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','fixture-expired',true,now()-interval '1 day');
INSERT INTO public.system_templates(id,title,content,is_active) VALUES ('active','Customized template','{"preserve":"custom"}',true),('inactive','Inactive template','{}',false);
INSERT INTO public.user_configs(user_id,key,value) VALUES ('11111111-1111-4111-8111-111111111111','ai_config_v3','{"version":3}'),('22222222-2222-4222-8222-222222222222','fixture','{"value":"private"}');
INSERT INTO public.ai_conversations(id,user_id,title,messages) VALUES ('conv_historical','11111111-1111-4111-8111-111111111111','Retain conversation','[{"role":"user","content":"保留消息"}]');
