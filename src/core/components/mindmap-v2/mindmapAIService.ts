/**
 * mindmapAIService.ts — AI 扩展分支服务
 *
 * 读取用户配置的 AI Provider（与 AIConfigModal 共用 localStorage 配置），
 * 根据给定节点的主题和路径，生成若干子主题建议。
 */

import {
    getMindMapAIRuntime,
    type MindMapAIProviderConfig,
} from '../../ports/mindMapAIRuntime';
import type { NodeObj } from 'mind-elixir';
import {
    parseTaskClassifications,
    type TaskClassificationResult,
    type TaskItemInput,
} from './mindmapTaskAIParsing';
import {
    cleanAndValidateTree,
    cleanMindMapIcons,
    cleanMindMapNote,
    cleanMindMapTags,
    cleanMindMapTopic,
} from './mindmapTreeSanitizer';
import {
    cleanSpeakerContext,
    cleanSpeakerNotes,
    cleanSpeakerTone,
    cleanSpeakerTopic,
} from './mindmapSpeakerNotesSecurity';

export interface AIExpandOptions {
    /** 当前节点 */
    node: NodeObj;
    /** 节点在树中的祖先路径（从根到父节点的 topic 数组） */
    ancestorPath?: string[];
    /** 要生成的子主题数量 */
    count?: number;
    /** 额外的上下文说明（整个导图的主题） */
    mapTitle?: string;
}

export interface AIExpandResult {
    topics: string[];
    error?: string;
}

const requestMindMapChat = async (
    provider: MindMapAIProviderConfig,
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    options: { max_tokens: number; temperature: number }
) => {
    return getMindMapAIRuntime().requestChatCompletionJson(provider, {
        model: modelId,
        messages,
        ...options,
    });
};

const formatMindMapAIRequestError = (error: unknown, maxLength = 120) => (
    getMindMapAIRuntime().formatRequestError(error, maxLength)
);

/** 调用用户配置的 AI 接口，生成子主题列表 */
export async function expandNodeWithAI(options: AIExpandOptions): Promise<AIExpandResult> {
    const { node, ancestorPath = [], count = 4, mapTitle } = options;

    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { topics: [], error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { topics: [], error: '请在 AI 设置中选择一个模型' };
    }

    const contextPath = [...ancestorPath, node.topic].join(' > ');

    const prompt = [
        mapTitle ? `思维导图主题：${mapTitle}` : null,
        `当前节点路径：${contextPath}`,
        `请为"${node.topic}"节点生成 ${count} 个子主题。`,
        '要求：',
        '- 每行一个子主题',
        '- 简洁有力，3~8 字为宜',
        '- 不要编号、不要符号前缀',
        '- 与父节点紧密相关',
        '- 彼此互不重叠',
    ].filter(Boolean).join('\n');

    try {
        const data = await requestMindMapChat(provider, modelId, [
            {
                role: 'system',
                content: '你是一个专业的思维导图助手。请根据用户的要求生成简洁、准确的子主题列表，每行一个，不要有其他内容。',
            },
            { role: 'user', content: prompt },
        ], { max_tokens: 512, temperature: 0.7 });
        const raw: string = data.choices?.[0]?.message?.content ?? '';

        const topics = raw
            .split('\n')
            .map(l => l.replace(/^[-\d.*•·]+\s*/, '').trim())
            .filter(l => l.length > 0 && l.length < 60)
            .slice(0, count + 2); // 多取 2 个，让用户选

        if (topics.length === 0) {
            return { topics: [], error: '模型未返回有效的子主题，请重试' };
        }

        return { topics };
    } catch (e: any) {
        return { topics: [], error: await formatMindMapAIRequestError(e) };
    }
}

/** 从根节点向下找到目标节点的祖先路径 */
export function getAncestorPath(root: NodeObj, targetId: string): string[] {
    function dfs(node: NodeObj, path: string[]): string[] | null {
        if (node.id === targetId) return path;
        for (const child of node.children ?? []) {
            const result = dfs(child, [...path, node.topic]);
            if (result) return result;
        }
        return null;
    }
    return dfs(root, []) ?? [];
}

/** 根据用户提示词 (Prompt)，使用 AI 生成完整的思维导图 JSON 树 */
export async function generateMindMapFromPrompt(promptText: string): Promise<{ nodeData: NodeObj } | { error: string }> {
    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const systemPrompt = `你是一个专业的思维导图生成助手。请根据用户的需求，生成一份结构清晰、多层级、细节丰富且视觉直观的思维导图，并严格以 JSON 格式输出。
不要输出任何 markdown 格式的标记字符（如 \`\`\`json 等），不要输出任何解释说明性文本，只需输出合法的 JSON 本身。

JSON 结构必须严格符合以下 TypeScript 类型：
interface NodeObj {
    id: string; // 节点唯一ID，请使用随机短字符串或带前缀的标识符，如 "n_1", "n_2"
    topic: string; // 节点名称
    children?: NodeObj[]; // 子节点数组
    expanded?: boolean; // 是否展开，通常根节点设为 true，其他可选
    note?: string; // 选填。对此节点的详细备注或解释说明，支持普通文本（如名词定义、步骤解释等）
    hyperLink?: string; // 选填。与此节点相关的权威参考网址或链接（如维基百科、官方文档等）
    icons?: string[]; // 选填。与此节点非常相符的 emoji 小图标数组（最多 2 个，如 ["💻", "🚀"]）
    tags?: string[]; // 选填。给该节点打上的简短标签，如 ["重点", "难点", "基础", "第1步"]，最多 2 个
}

为了使思维导图内容详实，请尽量在有深度概念、需要补充说明的节点上提供 'note'，在某些有公开文档的主题上提供 'hyperLink'，并在核心或步骤节点上打上适当的 'tags' 和 'icons'。
根节点的 id 请设为 "root"。
尽量生成 3 至 4 层结构，子节点数量适中，词条简洁有力（3~8字为宜）。`;

    const userPrompt = `请为主题"${promptText}"生成一个思维导图 JSON 树结构。`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { max_tokens: 1500, temperature: 0.7 });
        let content: string = data.choices?.[0]?.message?.content ?? '';

        // Clean markdown wraps
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

        const parsed = JSON.parse(content);
        const nodeData = cleanAndValidateTree(parsed, true);
        return { nodeData };
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}

/** 使用 AI 根据子节点内容归纳修改当前节点的主题 */
export async function summarizeNodeWithAI(nodeTopic: string, childrenTopics: string[]): Promise<{ topic: string } | { error: string }> {
    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const prompt = `当前节点名称：${nodeTopic}
子分支内容：
${childrenTopics.map(t => `- ${t}`).join('\n')}

请根据上述子分支的具体内容，对当前父节点的名称进行重新归纳和提炼，使其更加精准、概括和有逻辑性。
要求：
- 只返回一个精简的新节点名称（字数在 3~10 字之间）
- 不要包含任何其他解释性文字，不要有引号或编号
- 如果无法更好地归纳，请直接返回原名称"${nodeTopic}"`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: '你是一个思维导图优化助手。请只输出重新归纳后的节点名称，不要包含任何额外文字。' },
            { role: 'user', content: prompt },
        ], { max_tokens: 60, temperature: 0.5 });
        let topic = (data.choices?.[0]?.message?.content ?? '').trim();
        topic = topic.replace(/^["'“‘]/, '').replace(/["'”’]$/, '').trim();
        return { topic: cleanMindMapTopic(topic || nodeTopic, nodeTopic) };
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}

export interface AICustomActionOptions {
    node: NodeObj;
    customPrompt: string;
    ancestorPath?: string[];
    mapTitle?: string;
}

export interface AICustomActionResult {
    topic?: string;
    note?: string;
    tags?: string[];
    icons?: string[];
    newChildren?: NodeObj[];
    error?: string;
}

export function sanitizeAICustomActionResult(value: unknown): AICustomActionResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const parsed = value as Record<string, unknown>;
    const result: AICustomActionResult = {};

    if (parsed.topic !== undefined) result.topic = cleanMindMapTopic(parsed.topic);
    if (parsed.note !== undefined) result.note = cleanMindMapNote(parsed.note);
    if (parsed.tags !== undefined) result.tags = cleanMindMapTags(parsed.tags);
    if (parsed.icons !== undefined) result.icons = cleanMindMapIcons(parsed.icons);

    if (Array.isArray(parsed.newChildren)) {
        result.newChildren = parsed.newChildren.map((child) => {
            const childId = `ai_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            return cleanAndValidateTree({
                ...(child && typeof child === 'object' && !Array.isArray(child) ? child as Record<string, unknown> : {}),
                id: childId,
                children: [],
            }, false);
        });
    }

    return result;
}

/**
 * 接收选定节点及自定义指令，由 AI 返回局部更新字段（JSON）
 */
export async function processNodeWithAICustomAction(
    options: AICustomActionOptions
): Promise<AICustomActionResult> {
    const { node, customPrompt, ancestorPath = [], mapTitle } = options;

    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const contextPath = [...ancestorPath, node.topic].join(' > ');

    const systemPrompt = `你是一个专业的思维导图节点智能处理助手。用户选择了一个节点，并输入了一条处理指令。
你必须根据指令对该节点自身属性（名称 topic、备注 note、标签 tags、图标 icons）进行修改，或者为其生成新的子节点数组（newChildren）。

当前选中节点的信息：
- 节点名称 (topic): "${node.topic}"
- 详细备注 (note): "${node.note || '(无)'}"
- 标签 (tags): ${JSON.stringify(node.tags || [])}
- 图标 (icons): ${JSON.stringify(node.icons || [])}
- 上下文层级路径: "${contextPath}"
${mapTitle ? `- 整个导图的主题: "${mapTitle}"` : ''}

用户的处理指令：
"${customPrompt}"

请严格以 JSON 格式输出修改后的节点增量数据，不要输出任何 markdown 格式的标记字符（如 \`\`\`json 等），不要有任何解释说明文字，只输出合法的 JSON 本身。
JSON 结构中只能包含以下可选字段：
{
  "topic": "修改后的节点名称（如果指令要求改写、翻译或提炼名称，否则可以省略或返回原名称）",
  "note": "修改后的详细备注内容（如果指令要求写备注、扩写、补充详细说明，否则可以省略）",
  "tags": ["新标签"], // 字符串数组。最多2个，如 ["紧急"]。如果指令要求加/改标签，返回更新后的完整标签数组
  "icons": ["emoji"], // 字符串数组。最多2个，如 ["🔴"]。如果指令要求加/改图标，返回更新后的完整图标数组
  "newChildren": [
     // 如果指令要求“增加子项”、“扩写步骤”、“生成创意”等，在此字段返回新生成的子节点数组，每个子节点也是 NodeObj 结构：
     {
       "topic": "子节点名称 (3-8字)",
       "note": "子节点详细备注（可选）",
       "icons": ["emoji"], // 可选
       "tags": ["标签"] // 可选
     }
  ]
}

注意：
1. 请根据指令的目的，只返回受影响的字段。例如，如果指令仅说“翻译成英文”，则通常只需返回翻译后的 "topic" 和 "note"（若有）。
2. 如果指令说“扩写3个子步骤”，则应保持当前节点的 "topic" 不变，只在 "newChildren" 中返回 3 个子节点。
3. 保持词条简洁有力（3~8字为宜）。`;

    const userPrompt = `请根据我的指令"${customPrompt}"，处理当前节点并返回增量修改 JSON。`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { max_tokens: 1000, temperature: 0.7 });
        let content: string = data.choices?.[0]?.message?.content ?? '';

        // 清洗 Markdown 包裹
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

        const parsed = JSON.parse(content);
        return sanitizeAICustomActionResult(parsed);
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}

/** 生成当前节点的演讲提词逐字稿 */
export async function generateSpeakerNotes(
    nodeTopic: string,
    noteText?: string,
    childText?: string,
    tone = '专业商务'
): Promise<{ notes: string } | { error: string }> {
    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const safeTopic = cleanSpeakerTopic(nodeTopic);
    const safeNote = cleanSpeakerContext(noteText);
    const safeChildText = cleanSpeakerContext(childText);
    const safeTone = cleanSpeakerTone(tone);

    const systemPrompt = `你是一个专业的演讲教练和演讲稿助手。根据用户提供的思维导图节点主题、备注和子节点内容，生成一段 100 到 200 字的口语化演讲演讲稿（逐字稿）。
请根据指定的语气风格生成。
生成的演讲稿应当：
- 直接输出演讲逐字稿内容，不要有任何开场白、括号注释或说明，也不要使用 markdown 语法包裹（如不需要 \`\`\` ）。
- 字数严格控制在 100~200 字之间。
- 适合口语化表达，流畅自然，适合演示演讲时朗读。`;

    const userPrompt = `
当前演讲的节点主题："${safeTopic}"
${safeNote ? `此节点的详细备注："${safeNote}"` : ''}
${safeChildText ? `此节点包含的子概念/大纲："${safeChildText}"` : ''}
演讲语气风格限制："${safeTone}"

请为此节点生成对应的演讲稿。`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { max_tokens: 400, temperature: 0.7 });
        const notes = cleanSpeakerNotes(data.choices?.[0]?.message?.content);
        return { notes };
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}

/** 分析两个非层级节点之间的语义关系并返回 2~5 字的精炼关系 Label */
export async function analyzeNodesRelationship(
    sourceTopic: string,
    targetTopic: string
): Promise<{ relationText: string } | { error: string }> {
    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const systemPrompt = `你是一个思维导图语义关系分析专家。你的任务是分析用户指定的两个思维导图节点之间的关系，并给出一个极为精炼的关系标签。
你的回答必须是且仅能是 2 到 5 个字的中文名词或动词短语（如：“互补”、“因果”、“对比”、“组成部分”、“演进”、“依赖”、“竞品关系”等）。
不要输出任何解释说明性文字，不要包含任何标点符号或包裹引号，只需返回那 2-5 个字的关系词本身。`;

    const userPrompt = `节点 A 的主题: "${sourceTopic}"
节点 B 的主题: "${targetTopic}"
请用 2-5 个字概括节点 A 与节点 B 的语义关系：`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { max_tokens: 30, temperature: 0.5 });
        let relationText = (data.choices?.[0]?.message?.content ?? '').trim();
        // 清洗掉可能的引号
        relationText = relationText.replace(/^["'“‘]/, '').replace(/["'”’]$/, '').trim();
        return { relationText };
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}

export type { TaskClassificationResult, TaskItemInput } from './mindmapTaskAIParsing';

/** 使用 AI 智能分析分类任务 */
export async function classifyTasksWithAI(
    tasks: TaskItemInput[]
): Promise<{ classifications: TaskClassificationResult[] } | { error: string }> {
    const config = await getMindMapAIRuntime().loadConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { error: '请在 AI 设置中选择一个模型' };
    }

    const systemPrompt = `你是一个专业的敏捷项目经理和任务管理专家。你的任务是分析用户提供的脑图叶子节点（任务项），根据它们的语义、关联上下文和依赖关系，智能地将它们分类到看板的不同状态轨道（"todo" 待办, "doing" 进行中, "done" 已完成），并赋予合适的优先级（"高"、"中"、"低"）。
通常绝大多数任务初始状态应为 "todo"，少部分已经在进行中的概念可归为 "doing"，完成的概念归为 "done"。
必须严格返回如下格式的 JSON 数组，不要有任何 Markdown 包裹（如不要 \`\`\`json ），不要有任何额外的文字或解释：
[
  {
    "id": "任务ID",
    "status": "todo" | "doing" | "done",
    "priority": "高" | "中" | "低"
  }
]`;

    const userPrompt = `待分类任务列表：
${JSON.stringify(tasks, null, 2)}

请对它们进行分类和优先级规划。`;

    try {
        const data = await requestMindMapChat(provider, modelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { max_tokens: 1500, temperature: 0.5 });
        const content = (data.choices?.[0]?.message?.content ?? '').trim();

        const classifications = parseTaskClassifications(content);
        if (classifications.length === 0) {
            return { error: 'AI 未返回可用的任务分类结果' };
        }
        return { classifications };
    } catch (e: any) {
        return { error: await formatMindMapAIRequestError(e) };
    }
}



