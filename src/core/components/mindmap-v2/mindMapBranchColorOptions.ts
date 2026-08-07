export interface BranchColorOption {
    value: string | undefined;
    label: string;
}

export const MIND_MAP_BRANCH_COLOR_OPTIONS: readonly BranchColorOption[] = [
    { value: '#6366f1', label: '靛蓝' },
    { value: '#8b5cf6', label: '紫色' },
    { value: '#ec4899', label: '粉色' },
    { value: '#ef4444', label: '红色' },
    { value: '#f97316', label: '橙色' },
    { value: '#eab308', label: '黄色' },
    { value: '#22c55e', label: '绿色' },
    { value: '#06b6d4', label: '青色' },
    { value: '#3b82f6', label: '蓝色' },
    { value: '#64748b', label: '灰色' },
    { value: '#ffffff', label: '白色' },
    { value: undefined, label: '继承主题' },
];
