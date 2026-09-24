-- 给 system_templates 表加 thumbnail_url 列
ALTER TABLE public.system_templates ADD COLUMN IF NOT EXISTS thumbnail_url text;
