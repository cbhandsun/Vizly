import type { DocsPreviewLocale, DocsPreviewTopic } from './docsPreviewModel';

export interface DocsPreviewCopy {
    productName: string;
    pageTitle: string;
    pageDescription: string;
    backToWorkspace: string;
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    topicNavigation: string;
    resultStatus: (count: number) => string;
    noResultsTitle: string;
    noResultsHint: string;
    articleLabel: string;
    updatedLabel: string;
    updatedValue: string;
    topics: readonly DocsPreviewTopic[];
}

const zhTopics: readonly DocsPreviewTopic[] = [
    {
        id: 'getting-started',
        eyebrow: '01 · 入门',
        title: '快速开始',
        summary: '从工作台创建第一张图，并理解 Vizly 的保存方式。',
        keywords: ['新建', '模板', '工作台', '保存', '开始'],
        sections: [
            {
                title: '创建第一张图',
                body: '回到工作台后选择“新建图表”，再从空白画布或业务模板开始。模板适合快速对齐团队规范，空白画布适合自由探索。',
                bullets: ['先给图表一个能被团队理解的名称。', '选择与任务匹配的图表类型。', '进入画布后先确认自动保存状态。'],
            },
            {
                title: '理解保存边界',
                body: '本地模式会把图表保存在当前浏览器；启用云端存储后，图表可以跨设备同步。切换存储方式前先确认当前内容已经保存。',
            },
        ],
    },
    {
        id: 'diagram-editing',
        eyebrow: '02 · 制作',
        title: '流程图制作',
        summary: '添加节点、连接关系、整理布局并安全撤销操作。',
        keywords: ['节点', '连线', '布局', '撤销', '流程图', '画布'],
        sections: [
            {
                title: '建立清晰结构',
                body: '先放置关键业务节点，再补充连接关系。节点名称使用动作或业务对象，避免只写“步骤一”这类缺少语义的标题。',
                bullets: ['双击空白区域或使用工具栏添加节点。', '从节点连接点拖拽到目标节点建立关系。', '使用自动布局后再做少量人工微调。'],
            },
            {
                title: '安全编辑',
                body: '删除、粘贴和批量布局前先确认选择范围。误操作可以使用撤销；当页面提示有未保存变更时，先保存或明确放弃再离开。',
            },
        ],
    },
    {
        id: 'ai-assistant',
        eyebrow: '03 · 智能能力',
        title: 'AI 助手',
        summary: '配置模型、提出可执行请求并审查生成结果。',
        keywords: ['AI', '模型', '提示词', '生成', '配置'],
        sections: [
            {
                title: '开始前的检查',
                body: '首次使用时在设置中选择服务提供商并验证连接。密钥只保存在受支持的安全存储中，不要粘贴到图表标题、节点或聊天正文。',
            },
            {
                title: '让结果可验证',
                body: '描述目标、约束和期望输出，再把 AI 建议作为草稿审查。涉及删除、覆盖或大规模布局的操作，应先预览影响范围。',
                bullets: ['一次只提出一个明确任务。', '说明不能修改的节点或分组。', '生成后检查名称、连线和业务含义。'],
            },
        ],
    },
    {
        id: 'sharing',
        eyebrow: '04 · 协作',
        title: '分享与只读查看',
        summary: '创建分享链接、确认访问范围并处理失效链接。',
        keywords: ['分享', '链接', '只读', '协作', '权限'],
        sections: [
            {
                title: '分享前确认',
                body: '分享链接可能让链接持有人查看当前图表。创建前检查图表是否包含客户数据、密钥、内部地址或不应外发的备注。',
            },
            {
                title: '接收者体验',
                body: '接收者通过只读页面查看图表。链接无效或服务暂不可用时，页面会提供返回工作台或重试入口；不要通过反复刷新绕过错误提示。',
            },
        ],
    },
    {
        id: 'storage-sync',
        eyebrow: '05 · 数据',
        title: '存储与同步',
        summary: '在本地与云端模式之间做可恢复的选择。',
        keywords: ['存储', '同步', '本地', '云端', '备份'],
        sections: [
            {
                title: '选择存储模式',
                body: '个人试用可以使用本地模式；需要跨设备访问或团队协作时，配置受支持的云端存储。连接失败不会自动删除本地数据。',
            },
            {
                title: '变更前留出恢复路径',
                body: '修改服务地址、凭据或存储提供商前先导出重要图表。完成配置后使用连接测试确认读写能力，再开始迁移。',
            },
        ],
    },
    {
        id: 'keyboard-accessibility',
        eyebrow: '06 · 效率',
        title: '键盘与无障碍操作',
        summary: '不用鼠标也能导航主要界面并完成常用操作。',
        keywords: ['键盘', '快捷键', '无障碍', '焦点', 'Tab'],
        sections: [
            {
                title: '基础导航',
                body: '使用 Tab 和 Shift+Tab 在可操作元素之间移动，Enter 或空格触发按钮。焦点会以清晰描边显示；如果焦点进入弹窗，关闭弹窗后应返回触发位置。',
            },
            {
                title: '画布快捷方式',
                body: '常用操作包括撤销、重做、复制、粘贴、删除和打开快捷键帮助。输入文字时，编辑器会避免把普通字符误当作画布命令。',
            },
        ],
    },
];

const enTopics: readonly DocsPreviewTopic[] = [
    {
        id: 'getting-started', eyebrow: '01 · Start', title: 'Getting started', summary: 'Create your first diagram and understand how Vizly saves work.', keywords: ['create', 'template', 'workspace', 'save'],
        sections: [
            { title: 'Create your first diagram', body: 'Return to the workspace, choose New diagram, and start from a blank canvas or a business template.', bullets: ['Use a name your team can recognize.', 'Choose the diagram type that matches the task.', 'Confirm the save state after opening the canvas.'] },
            { title: 'Understand storage', body: 'Local mode keeps diagrams in this browser. A configured cloud provider enables cross-device access. Save current work before changing storage modes.' },
        ],
    },
    {
        id: 'diagram-editing', eyebrow: '02 · Build', title: 'Building flowcharts', summary: 'Add nodes, connect relationships, organize layout, and recover safely.', keywords: ['node', 'edge', 'layout', 'undo', 'canvas'],
        sections: [
            { title: 'Build a clear structure', body: 'Place the important business nodes first, then add relationships. Use action-oriented or domain-specific names.', bullets: ['Add nodes from the canvas or toolbar.', 'Drag from a node handle to create a relationship.', 'Run automatic layout before small manual adjustments.'] },
            { title: 'Edit safely', body: 'Confirm the selection before delete, paste, or batch layout. Use undo for mistakes and resolve unsaved-change prompts before leaving.' },
        ],
    },
    {
        id: 'ai-assistant', eyebrow: '03 · Intelligence', title: 'AI assistant', summary: 'Configure a model, make actionable requests, and review generated results.', keywords: ['AI', 'model', 'prompt', 'generate', 'provider'],
        sections: [
            { title: 'Check readiness', body: 'Choose a provider in settings and verify the connection. Keep credentials in supported secure storage, never in diagram or chat content.' },
            { title: 'Keep results verifiable', body: 'State the goal, constraints, and expected output. Treat generated changes as a draft and preview destructive or large-scale actions.', bullets: ['Request one clear task at a time.', 'Name nodes or groups that must not change.', 'Review labels, relationships, and business meaning.'] },
        ],
    },
    {
        id: 'sharing', eyebrow: '04 · Collaborate', title: 'Sharing and read-only viewing', summary: 'Create share links, confirm exposure, and recover from expired links.', keywords: ['share', 'link', 'readonly', 'permission'],
        sections: [
            { title: 'Check before sharing', body: 'Anyone with a share link may be able to view the diagram. Remove customer data, credentials, internal URLs, and private notes first.' },
            { title: 'Recipient experience', body: 'Recipients use a read-only viewer. Invalid or unavailable links provide retry or workspace recovery actions.' },
        ],
    },
    {
        id: 'storage-sync', eyebrow: '05 · Data', title: 'Storage and sync', summary: 'Choose between local and cloud modes with a recovery path.', keywords: ['storage', 'sync', 'local', 'cloud', 'backup'],
        sections: [
            { title: 'Choose a mode', body: 'Local mode works for individual trials. Configure a supported cloud provider for cross-device access or collaboration.' },
            { title: 'Keep a recovery path', body: 'Export important diagrams before changing endpoints, credentials, or providers. Test read and write access before migration.' },
        ],
    },
    {
        id: 'keyboard-accessibility', eyebrow: '06 · Efficiency', title: 'Keyboard and accessibility', summary: 'Navigate the main experience and complete common actions without a mouse.', keywords: ['keyboard', 'shortcut', 'accessibility', 'focus', 'tab'],
        sections: [
            { title: 'Basic navigation', body: 'Use Tab and Shift+Tab to move, then Enter or Space to activate controls. A visible outline identifies keyboard focus.' },
            { title: 'Canvas shortcuts', body: 'Common commands include undo, redo, copy, paste, delete, and shortcut help. Text editing prevents regular characters from becoming canvas commands.' },
        ],
    },
];

export const getDocsPreviewCopy = (locale: DocsPreviewLocale): DocsPreviewCopy => locale === 'zh'
    ? {
        productName: 'Vizly 产品帮助',
        pageTitle: '从想法到清晰图表',
        pageDescription: '查找创建、编辑、分享和保护图表所需的操作指南。',
        backToWorkspace: '返回工作台',
        searchLabel: '搜索帮助主题',
        searchPlaceholder: '搜索节点、分享、存储或快捷键',
        clearSearch: '清除搜索',
        topicNavigation: '帮助主题',
        resultStatus: (count) => `找到 ${count} 个帮助主题`,
        noResultsTitle: '没有匹配的帮助主题',
        noResultsHint: '请缩短关键词，或清除搜索查看全部主题。',
        articleLabel: '帮助正文',
        updatedLabel: '内容更新',
        updatedValue: '2026 年 8 月',
        topics: zhTopics,
    }
    : {
        productName: 'Vizly Help',
        pageTitle: 'From idea to a clear diagram',
        pageDescription: 'Find practical guidance for creating, editing, sharing, and protecting diagrams.',
        backToWorkspace: 'Back to workspace',
        searchLabel: 'Search help topics',
        searchPlaceholder: 'Search nodes, sharing, storage, or shortcuts',
        clearSearch: 'Clear search',
        topicNavigation: 'Help topics',
        resultStatus: (count) => `${count} help topics found`,
        noResultsTitle: 'No matching help topics',
        noResultsHint: 'Try a shorter term or clear search to see every topic.',
        articleLabel: 'Help article',
        updatedLabel: 'Updated',
        updatedValue: 'August 2026',
        topics: enTopics,
    };
