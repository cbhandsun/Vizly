// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';

interface MenuItemMock {
    key: string;
    label: React.ReactNode;
    onClick: () => void;
}

interface DropdownMockProps {
    children: React.ReactElement<{ label: string }>;
    menu: {
        items: MenuItemMock[];
        'aria-label': string;
    };
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

vi.mock('antd', () => ({
    Dropdown: ({ children, menu, onOpenChange, open }: DropdownMockProps) => (
        <>
            <button
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={children.props.label}
                type="button"
                onClick={() => onOpenChange(!open)}
            />
            {open && (
                <div role="menu" aria-label={menu['aria-label']}>
                    {menu.items.map(item => (
                        <button key={item.key} role="menuitem" type="button" onClick={item.onClick}>
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </>
    ),
}));

const mindHarness = vi.hoisted(() => ({
    addChild: vi.fn(),
    busFire: vi.fn(),
    clearHistory: vi.fn(),
    currentNode: undefined as { id: string } | undefined,
    findEle: vi.fn(),
    getData: vi.fn(),
    refresh: vi.fn(),
    toCenter: vi.fn(),
}));

const antdHarness = vi.hoisted(() => ({
    confirm: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        addChild: mindHarness.addChild,
        bus: { fire: mindHarness.busFire },
        clearHistory: mindHarness.clearHistory,
        get currentNode() {
            return mindHarness.currentNode;
        },
        currentNodes: [],
        findEle: mindHarness.findEle,
        getData: mindHarness.getData,
        refresh: mindHarness.refresh,
        toCenter: mindHarness.toCenter,
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: antdHarness.error,
        info: antdHarness.info,
        success: antdHarness.success,
        warning: antdHarness.warning,
    },
    appModal: { confirm: antdHarness.confirm },
}));

import MindMapTemplates from '../MindMapTemplates';

interface ConfirmOptions {
    title?: React.ReactNode;
    content?: React.ReactNode;
    okText?: React.ReactNode;
    cancelText?: React.ReactNode;
    maskClosable?: boolean;
    onOk?: () => void;
}

let testI18n: i18n;

const previousRoot = {
    id: 'root',
    topic: 'Current map',
    children: [{ id: 'child', topic: 'Current child', children: [] }],
};

const renderTemplates = () => render(
    <I18nextProvider i18n={testI18n}>
        <MindMapTemplates />
    </I18nextProvider>,
);

const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Open node templates' }));
    return screen.getByRole('menu', { name: 'Mind map node templates' });
};

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
        interpolation: { escapeValue: false },
    });
});

beforeEach(async () => {
    await testI18n.changeLanguage('en');
    mindHarness.addChild.mockReset();
    mindHarness.busFire.mockReset();
    mindHarness.clearHistory.mockReset();
    mindHarness.currentNode = undefined;
    mindHarness.findEle.mockReset();
    mindHarness.getData.mockReset();
    mindHarness.getData.mockReturnValue({ nodeData: previousRoot, direction: 2 });
    mindHarness.refresh.mockReset();
    mindHarness.toCenter.mockReset();
    Object.values(antdHarness).forEach(mock => mock.mockReset());
});

describe('MindMapTemplates commercial workflow', () => {
    it('localizes the English menu and asks before replacing the current map', () => {
        renderTemplates();
        openMenu();

        expect(screen.getByRole('menuitem', { name: /SWOT analysis Strengths, weaknesses/ }))
            .toBeTruthy();
        expect(screen.getByRole('menuitem', { name: /Brainstorm.*Insert/ })).toBeTruthy();

        fireEvent.click(screen.getByRole('menuitem', { name: /SWOT analysis Strengths, weaknesses/ }));

        expect(mindHarness.refresh).not.toHaveBeenCalled();
        expect(mindHarness.busFire).not.toHaveBeenCalled();
        const confirmation = antdHarness.confirm.mock.calls[0]?.[0] as ConfirmOptions;
        expect(confirmation.title).toBe('Apply the SWOT analysis template?');
        expect(confirmation.content)
            .toBe('Applying “SWOT analysis” will replace all 2 current nodes. You can undo this action.');
        expect(confirmation.okText).toBe('Apply template');
        expect(confirmation.cancelText).toBe('Cancel');
        expect(confirmation.maskClosable).toBe(false);
    });

    it('commits replacement as one operation without clearing prior undo history', () => {
        renderTemplates();
        openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: /SWOT analysis Strengths, weaknesses/ }));
        const confirmation = antdHarness.confirm.mock.calls[0]?.[0] as ConfirmOptions;

        act(() => confirmation.onOk?.());

        const replacement = mindHarness.refresh.mock.calls[0]?.[0];
        expect(replacement.direction).toBe(2);
        expect(replacement.nodeData).toMatchObject({
            id: 'root',
            root: true,
            topic: 'SWOT analysis',
            children: [
                { topic: 'Strengths' },
                { topic: 'Weaknesses' },
                { topic: 'Opportunities' },
                { topic: 'Threats' },
            ],
        });
        expect(mindHarness.busFire).toHaveBeenCalledWith('operation', {
            name: 'template_apply',
            obj: replacement.nodeData,
        });
        expect(mindHarness.clearHistory).not.toHaveBeenCalled();
        expect(mindHarness.toCenter).toHaveBeenCalledOnce();
        expect(antdHarness.success).toHaveBeenCalledWith('Applied the SWOT analysis template');
    });

    it('guards insert mode when no node is selected', () => {
        renderTemplates();
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /Brainstorm.*Insert/ }));

        expect(antdHarness.info)
            .toHaveBeenCalledWith('Select a node before inserting this template.');
        expect(mindHarness.addChild).not.toHaveBeenCalled();
        expect(antdHarness.confirm).not.toHaveBeenCalled();
    });

    it('inserts localized children below a valid selection', () => {
        const parentTopic = document.createElement('div');
        mindHarness.currentNode = { id: 'selected-node' };
        mindHarness.findEle.mockReturnValue(parentTopic);
        renderTemplates();
        openMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: /Brainstorm.*Insert/ }));

        expect(mindHarness.addChild).toHaveBeenCalledTimes(4);
        expect(mindHarness.addChild.mock.calls.map(call => call[1].topic))
            .toEqual(['Idea A', 'Idea B', 'Idea C', 'Idea D']);
        expect(antdHarness.success).toHaveBeenCalledWith('Inserted 4 child nodes');
    });

    it('renders Chinese labels and template content in a Chinese workspace', async () => {
        await testI18n.changeLanguage('zh');
        renderTemplates();

        fireEvent.click(screen.getByRole('button', { name: '打开节点模板' }));
        expect(screen.getByRole('menu', { name: '思维导图节点模板' })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: /SWOT 分析 优势、劣势/ }));
        const confirmation = antdHarness.confirm.mock.calls[0]?.[0] as ConfirmOptions;
        expect(confirmation.title).toBe('套用“SWOT 分析”模板？');

        act(() => confirmation.onOk?.());
        expect(mindHarness.refresh.mock.calls[0]?.[0].nodeData.children[0].topic).toBe('优势');
        expect(antdHarness.success).toHaveBeenCalledWith('已套用“SWOT 分析”模板');
    });
});
