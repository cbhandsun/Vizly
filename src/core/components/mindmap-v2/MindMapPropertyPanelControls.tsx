import React from 'react';
import { Divider, Typography } from 'antd';
import { VIZLY_THEME_OPTIONS } from './theme';

const { Text } = Typography;

const QUICK_COLORS = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#ffffff', '#1e293b',
];

export const ColorSwatch: React.FC<{
    value?: string;
    onChange: (color: string) => void;
    withTransparent?: boolean;
}> = ({ value, onChange, withTransparent }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {withTransparent && (
            <button title="透明" onClick={() => onChange('')}
                style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    border: value === '' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: 'repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/8px 8px' }} />
        )}
        {QUICK_COLORS.map(color => (
            <button key={color} title={color} onClick={() => onChange(color)} style={{
                width: 22, height: 22, borderRadius: 5, background: color, cursor: 'pointer', flexShrink: 0,
                border: value === color ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.1)',
            }} />
        ))}
        <label title="自定义" style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
            border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 12, color: '#94a3b8', overflow: 'hidden' }}>
            +<input type="color" value={value || '#6366f1'}
                onChange={event => onChange(event.target.value)}
                style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }} />
        </label>
    </div>
);

export const PropertyRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{label}</Text>
        {children}
    </div>
);

export const CanvasPanel: React.FC<{
    activeTheme: string;
    onThemeChange: (key: string) => void;
}> = ({ activeTheme, onThemeChange }) => (
    <div style={{ padding: '12px 16px' }}>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>🎨 画布主题</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VIZLY_THEME_OPTIONS.map(option => {
                const isActive = activeTheme === option.key;
                return (
                    <button key={option.key} onClick={() => onThemeChange(option.key)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        border: `2px solid ${isActive ? '#6366f1' : 'transparent'}`,
                        borderRadius: 10, background: isActive ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.02)',
                        cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.18s ease',
                    }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                            background: option.theme.cssVar['--main-bgcolor'],
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>{option.label}</div>
                            <div style={{ fontSize: 11, color: isActive ? '#6366f1' : '#94a3b8', fontWeight: isActive ? 500 : 400 }}>
                                {isActive ? '✓ 当前主题' : option.theme.name}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
        <Divider style={{ margin: '16px 0 10px' }} />
        <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.08)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'rgba(0,0,0,0.45)', lineHeight: 1.9 }}>
            <div>💡 点击节点可编辑属性</div>
            <div>📋 右键节点打开操作菜单</div>
            <div>⌨️ Tab 键添加子节点</div>
            <div>🖱️ 滚轮缩放 / 拖拽平移</div>
        </div>
    </div>
);
