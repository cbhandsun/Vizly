-- Create the system_templates table for cloud-based general template mechanism
CREATE TABLE IF NOT EXISTS public.system_templates (
    id text PRIMARY KEY,
    title text NOT NULL,
    content jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;

-- Add new columns in case the table was created previously without them
ALTER TABLE public.system_templates ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.system_templates ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.system_templates ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.system_templates ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Allow anyone to read active templates (so users can load them)
DROP POLICY IF EXISTS "Allow public read access to active templates" ON public.system_templates;
CREATE POLICY "Allow public read access to active templates" 
ON public.system_templates 
FOR SELECT 
USING (is_active = true);

-- Allow authenticated users with admin role to insert/update templates
-- (Using JWT claims or a separate admins table is recommended. For now, we allow any authenticated user to manage them, or just rely on the service role key for management)
DROP POLICY IF EXISTS "Allow admins to manage templates" ON public.system_templates;
CREATE POLICY "Allow admins to manage templates" 
ON public.system_templates 
FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- Insert comprehensive initial generic templates
INSERT INTO public.system_templates (id, title, description, category, tags, sort_order, content) VALUES
(
  'tpl-ecommerce-order',
  '电商订单状态流转',
  '标准电商订单状态流转图，涵盖支付、发货、退款等核心环节',
  'state-machine',
  ARRAY['电商', '订单', '状态机'],
  10,
  '{"metadata": {"title": "电商订单状态流转", "description": "标准电商订单状态流转图，涵盖支付、发货、退款等核心环节"}, "layout": {"type": "hierarchical", "direction": "TB"}, "nodes": [{"id": "created", "label": "订单创建 (待支付)", "domain": "Order"}, {"id": "paid", "label": "已支付 (待发货)", "domain": "Order"}, {"id": "cancelled", "label": "已取消", "domain": "Order"}, {"id": "shipped", "label": "已发货 (待收货)", "domain": "Fulfillment"}, {"id": "completed", "label": "交易完成", "domain": "Fulfillment"}, {"id": "refunding", "label": "退款中", "domain": "Service"}, {"id": "refunded", "label": "已退款", "domain": "Service"}], "edges": [{"source": "created", "target": "paid", "label": "用户支付"}, {"source": "created", "target": "cancelled", "label": "超时/主动取消"}, {"source": "paid", "target": "shipped", "label": "商家发货"}, {"source": "paid", "target": "refunding", "label": "用户申请退款"}, {"source": "shipped", "target": "completed", "label": "用户确认收货"}, {"source": "refunding", "target": "refunded", "label": "商家同意退款"}, {"source": "completed", "target": "refunding", "label": "售后退款"}]}'::jsonb
),
(
  'tpl-microservices-arch',
  '现代微服务架构',
  '典型后端微服务架构，包含网关、认证中心及核心业务服务',
  'architecture',
  ARRAY['后端', '微服务', '架构设计'],
  20,
  '{"metadata": {"title": "现代微服务架构", "description": "典型后端微服务架构，包含网关、认证中心及核心业务服务"}, "layout": {"type": "hierarchical", "direction": "LR"}, "nodes": [{"id": "client", "label": "Web / Mobile Client", "domain": "Frontend"}, {"id": "gateway", "label": "API Gateway\n(Kong / Nginx)", "domain": "Infrastructure"}, {"id": "auth", "label": "Auth Service\n(OAuth2/JWT)", "domain": "Security"}, {"id": "user_svc", "label": "User Service", "domain": "Backend"}, {"id": "order_svc", "label": "Order Service", "domain": "Backend"}, {"id": "cache", "label": "Redis Cache", "domain": "Database"}, {"id": "db_user", "label": "User DB (PostgreSQL)", "domain": "Database"}, {"id": "db_order", "label": "Order DB (MySQL)", "domain": "Database"}], "edges": [{"source": "client", "target": "gateway", "label": "HTTPS REST/GraphQL"}, {"source": "gateway", "target": "auth", "label": "鉴权请求"}, {"source": "gateway", "target": "user_svc", "label": "路由"}, {"source": "gateway", "target": "order_svc", "label": "路由"}, {"source": "user_svc", "target": "cache", "label": "缓存查询"}, {"source": "user_svc", "target": "db_user", "label": "读写"}, {"source": "order_svc", "target": "db_order", "label": "读写"}, {"source": "order_svc", "target": "user_svc", "label": "gRPC 内部调用"}]}'::jsonb
),
(
  'tpl-user-auth-flow',
  '用户注册与鉴权流程',
  '展示用户从发起注册到完成邮箱验证的完整逻辑判断流程',
  'flowchart',
  ARRAY['流程图', '注册', '鉴权'],
  30,
  '{"metadata": {"title": "用户注册与鉴权流程", "description": "展示用户从发起注册到完成邮箱验证的完整逻辑判断流程"}, "layout": {"type": "hierarchical", "direction": "TB"}, "nodes": [{"id": "start", "label": "开始注册", "domain": "UI"}, {"id": "input", "label": "提交邮箱与密码", "domain": "UI"}, {"id": "check_exist", "label": "邮箱是否已存在?", "domain": "Backend"}, {"id": "err_exist", "label": "提示已存在，引导登录", "domain": "UI"}, {"id": "create_user", "label": "创建待激活用户", "domain": "Backend"}, {"id": "send_email", "label": "发送验证邮件", "domain": "Notification"}, {"id": "verify_link", "label": "用户点击验证链接", "domain": "UI"}, {"id": "activate", "label": "账号激活", "domain": "Backend"}, {"id": "end", "label": "注册成功，进入首页", "domain": "UI"}], "edges": [{"source": "start", "target": "input"}, {"source": "input", "target": "check_exist", "label": "API 验证"}, {"source": "check_exist", "target": "err_exist", "label": "是"}, {"source": "check_exist", "target": "create_user", "label": "否"}, {"source": "create_user", "target": "send_email"}, {"source": "send_email", "target": "verify_link"}, {"source": "verify_link", "target": "activate", "label": "Token有效"}, {"source": "activate", "target": "end"}]}'::jsonb
),
(
  'tpl-ai-rag-system',
  'AI RAG 知识检索架构',
  '基于检索增强生成 (RAG) 的大语言模型问答系统架构',
  'architecture',
  ARRAY['AI', 'RAG', '大模型', '架构设计'],
  40,
  '{"metadata": {"title": "AI RAG 知识检索架构", "description": "基于检索增强生成 (RAG) 的大语言模型问答系统架构"}, "layout": {"type": "hierarchical", "direction": "LR"}, "nodes": [{"id": "doc", "label": "企业文档/知识库", "domain": "Data Source"}, {"id": "chunker", "label": "Document Splitter\n(分块处理)", "domain": "Data Pipeline"}, {"id": "embed", "label": "Embedding Model\n(文本向量化)", "domain": "AI Service"}, {"id": "vector_db", "label": "Vector DB\n(Milvus/Qdrant)", "domain": "Database"}, {"id": "user", "label": "User Query", "domain": "User"}, {"id": "query_embed", "label": "Query Embedding", "domain": "AI Service"}, {"id": "search", "label": "Similarity Search\n(向量检索)", "domain": "Database"}, {"id": "prompt", "label": "Prompt Construction\n(拼装上下文)", "domain": "Backend"}, {"id": "llm", "label": "Large Language Model", "domain": "AI Service"}, {"id": "answer", "label": "Final Answer", "domain": "User"}], "edges": [{"source": "doc", "target": "chunker"}, {"source": "chunker", "target": "embed"}, {"source": "embed", "target": "vector_db", "label": "存储向量"}, {"source": "user", "target": "query_embed"}, {"source": "query_embed", "target": "search", "label": "K-NN 检索"}, {"source": "search", "target": "prompt", "label": "返回 Top-K 文本"}, {"source": "user", "target": "prompt", "label": "原始问题"}, {"source": "prompt", "target": "llm", "label": "发送整合 Prompt"}, {"source": "llm", "target": "answer"}]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET 
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  content = EXCLUDED.content;
