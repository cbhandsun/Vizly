/**
 * 上传模版缩略图到 Supabase Storage，并 UPDATE system_templates.thumbnail_url
 *
 * 使用：
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/upload-thumbnails.mjs
 *
 * 该脚本会写入 Storage 和 system_templates，必须使用服务端运维 key，不能使用客户端 anon key。
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少环境变量，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 图片文件路径（从 AI 生成的 artifacts 目录）
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(__dirname, '../thumbnails');

// 缩略图文件 → 适用的模版 ID 列表
const THUMBNAIL_MAP = [
  {
    file: process.env.THUMB_WMS || join(__dirname, '../thumbnails/thumb_wms.png'),
    storageName: 'thumb_wms.png',
    templateIds: [
      'SupplyChainReceivingFlow',
      'wms-standard-flow',
      'WmsInventoryData',
      'wms-process-flow-v1',
      'wms-e2e-solution',
    ]
  },
  {
    file: process.env.THUMB_ARCH || join(__dirname, '../thumbnails/thumb_architecture.png'),
    storageName: 'thumb_architecture.png',
    templateIds: [
      'enterprise-architecture-v2',
      'systems-interaction-v1',
      'tpl-microservices-arch',
    ]
  },
  {
    file: process.env.THUMB_TMS || join(__dirname, '../thumbnails/thumb_tms.png'),
    storageName: 'thumb_tms.png',
    templateIds: [
      'tms-architecture-v1',
      'transport-driven-v1',
    ]
  },
  {
    file: process.env.THUMB_PLANNING || join(__dirname, '../thumbnails/thumb_planning.png'),
    storageName: 'thumb_planning.png',
    templateIds: [
      'logistics-planning-v1',
      'wms-demand-allocation-strategy-v2',
      'logistics-architecture-v1',
    ]
  },
  {
    file: process.env.THUMB_GENERAL || join(__dirname, '../thumbnails/thumb_general.png'),
    storageName: 'thumb_general.png',
    templateIds: [
      'blank-canvas-template',
      'TailToTailHandover',
      'wms-order-to-task-flow',
      'tpl-user-auth-flow',
    ]
  },
  {
    file: process.env.THUMB_AI || join(__dirname, '../thumbnails/thumb_ai.png'),
    storageName: 'thumb_ai.png',
    templateIds: [
      'tpl-ai-rag-system',
    ]
  },
  {
    file: process.env.THUMB_ECOMMERCE || join(__dirname, '../thumbnails/thumb_ecommerce.png'),
    storageName: 'thumb_ecommerce.png',
    templateIds: [
      'tpl-ecommerce-order',
    ]
  },
];

const BUCKET = 'template-thumbnails';

async function ensureBucket() {
  // 尝试创建 bucket（如果已存在则忽略）
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
  });
  if (error && !error.message.includes('already exists')) {
    console.warn('⚠️  创建 bucket 警告:', error.message);
  }
}

async function uploadAndUpdate({ file, storageName, templateIds }) {
  // 读取图片
  let imageData;
  try {
    imageData = readFileSync(file);
  } catch (e) {
    console.error(`❌ 读取文件失败: ${file}`);
    return;
  }

  // 上传到 Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storageName, imageData, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error(`❌ 上传失败 [${storageName}]:`, uploadError.message);
    return;
  }

  // 获取公开 URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storageName);
  const publicUrl = urlData?.publicUrl;

  if (!publicUrl) {
    console.error(`❌ 获取公开 URL 失败: ${storageName}`);
    return;
  }

  console.log(`  📤 已上传: ${storageName} → ${publicUrl}`);

  // 批量 UPDATE 对应的模版
  const { error: updateError, count } = await supabase
    .from('system_templates')
    .update({ thumbnail_url: publicUrl })
    .in('id', templateIds);

  if (updateError) {
    console.error(`  ❌ UPDATE 失败:`, updateError.message);
  } else {
    console.log(`  ✅ 更新了 ${templateIds.length} 个模版的 thumbnail_url: [${templateIds.join(', ')}]`);
  }
}

async function main() {
  console.log('🚀 开始上传缩略图...\n');

  await ensureBucket();

  for (const entry of THUMBNAIL_MAP) {
    console.log(`\n📸 处理: ${entry.storageName}`);
    await uploadAndUpdate(entry);
  }

  console.log('\n🎉 完成！');
}

main().catch(e => {
  console.error('❌ 脚本异常:', e);
  process.exit(1);
});
