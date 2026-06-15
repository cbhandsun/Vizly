/**
 * 迁移脚本：将本地 standardized/*.json 批量上传到 Supabase system_templates 表
 * 
 * 使用方法：
 *   node scripts/migrate-presets-to-supabase.mjs
 * 
 * 依赖环境变量：SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 该脚本会写入 system_templates，必须使用服务端运维 key，不能使用客户端 anon key。
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, '../src/data/standardized');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 Supabase 环境变量，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 这些 tags 被认为是「通用」的，有这类 tag 但没有其他行业 tag 的，分类为 general
const GENERIC_TAGS = new Set(['空白', 'blank', 'general', '通用']);

function classifyCategory(tags = []) {
  const industryTags = tags.filter(t => !GENERIC_TAGS.has(t));
  if (industryTags.length > 0) return 'industry';
  return 'general';
}

async function migrate() {
  console.log('🚀 开始迁移本地预设到 Supabase...\n');

  // 读取所有 JSON 文件
  const files = readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
  console.log(`📦 发现 ${files.length} 个预设文件：${files.join(', ')}\n`);

  const records = [];
  const seenIds = new Set();

  for (const file of files) {
    const filePath = join(PRESETS_DIR, file);
    let data;
    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.warn(`⚠️  跳过无法解析的文件: ${file}`);
      continue;
    }

    const key = file.replace(/\.json$/i, ''); // 文件名作为 ID（如 SupplyChainReceivingFlow）
    const id = data.id || key;

    // 去重（LEGACY_ID_MAP 可能导致相同数据有多个 ID）
    if (seenIds.has(id)) {
      console.log(`  ⏭️  跳过重复项: ${id}`);
      continue;
    }
    seenIds.add(id);

    const metadata = data.metadata || {};
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const title = metadata.title || data.name || key;
    const description = metadata.description || '';
    const category = classifyCategory(tags);

    records.push({
      id,
      title,
      description,
      category,
      tags,
      sort_order: category === 'general' ? 9000 : 100, // 通用模版排在最后
      content: data,
      is_active: true,
    });

    console.log(`  ✅ 准备: [${category}] ${title} (id: ${id}, tags: [${tags.join(', ')}])`);
  }

  console.log(`\n📤 正在上传 ${records.length} 条记录到 Supabase...\n`);

  // 分批上传（每批 5 条，避免请求体过大）
  const BATCH_SIZE = 5;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchTitles = batch.map(r => r.title).join(', ');

    const { error } = await supabase
      .from('system_templates')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  ❌ 批次失败 [${batchTitles}]:`, error.message);
      failCount += batch.length;
    } else {
      console.log(`  ✅ 成功上传: ${batchTitles}`);
      successCount += batch.length;
    }
  }

  console.log(`\n🎉 迁移完成！`);
  console.log(`   成功: ${successCount} 条`);
  console.log(`   失败: ${failCount} 条`);

  if (failCount > 0) {
    console.log('\n⚠️  有失败记录，请检查 Supabase RLS 策略。');
    console.log('   建议使用 Service Role Key 重试：');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=<your-key> node scripts/migrate-presets-to-supabase.mjs');
  }
}

migrate().catch(e => {
  console.error('❌ 迁移脚本异常:', e);
  process.exit(1);
});
