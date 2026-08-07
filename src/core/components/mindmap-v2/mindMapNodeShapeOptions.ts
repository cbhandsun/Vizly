export type MindMapNodeShapeValue = '' | 'oval' | 'rect' | 'underline' | 'diamond';

export interface MindMapNodeShapeOption {
    value: MindMapNodeShapeValue;
    label: string;
    description: string;
    icon: 'default' | 'oval' | 'rect' | 'underline' | 'diamond';
}

export const MIND_MAP_NODE_SHAPE_OPTIONS: readonly MindMapNodeShapeOption[] = [
    { value: '', label: '默认', description: '跟随当前主题', icon: 'default' },
    { value: 'oval', label: '椭圆', description: '柔和强调', icon: 'oval' },
    { value: 'rect', label: '矩形', description: '结构清晰', icon: 'rect' },
    { value: 'underline', label: '下划线', description: '轻量层级', icon: 'underline' },
    { value: 'diamond', label: '菱形', description: '关键判断', icon: 'diamond' },
];
