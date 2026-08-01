// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NodeTemplate } from '../hooks/useNodeTemplates';
import { NodeTemplatePanel } from '../NodeTemplatePanel';

const template: NodeTemplate = {
    id: 'tpl-1',
    name: '审批节点',
    category: '我的模板',
    nodeType: 'flowchart',
    data: { shape: 'diamond', theme: { main: '#1677ff' } },
    createdAt: 1,
};

describe('NodeTemplatePanel', () => {
    it('exposes named template actions and an explicit rename flow', () => {
        const onUseTemplate = vi.fn();
        const onRenameTemplate = vi.fn();
        render(
            <NodeTemplatePanel
                templates={[template]}
                groupedTemplates={{ 我的模板: [template] }}
                onUseTemplate={onUseTemplate}
                onDeleteTemplate={vi.fn()}
                onRenameTemplate={onRenameTemplate}
            />,
        );

        expect(screen.getByRole('textbox', { name: '搜索模板' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '添加模板 审批节点 到画布' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '删除模板 审批节点' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '使用模板 审批节点' }));
        expect(onUseTemplate).toHaveBeenCalledWith('tpl-1');

        fireEvent.click(screen.getByRole('button', { name: '重命名模板 审批节点' }));
        const renameInput = screen.getByRole('textbox', { name: '重命名模板 审批节点' });
        fireEvent.change(renameInput, { target: { value: '  已审核节点  ' } });
        fireEvent.keyDown(renameInput, { key: 'Enter' });

        expect(onRenameTemplate).toHaveBeenCalledWith('tpl-1', '已审核节点');
    });

    it('shows an explicit no-match state and a named clear action', () => {
        render(
            <NodeTemplatePanel
                templates={[template]}
                groupedTemplates={{ 我的模板: [template] }}
                onUseTemplate={vi.fn()}
                onDeleteTemplate={vi.fn()}
                onRenameTemplate={vi.fn()}
            />,
        );

        const search = screen.getByRole('textbox', { name: '搜索模板' });
        fireEvent.change(search, { target: { value: '不存在' } });

        expect(screen.getByText('未找到匹配模板')).toBeTruthy();
        expect(screen.getByRole('button', { name: '清除模板搜索' })).toBeTruthy();
    });
});
