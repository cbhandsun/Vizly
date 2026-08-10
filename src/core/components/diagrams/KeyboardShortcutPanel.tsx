import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Modal, Space, theme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { FaKeyboard } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';
import './KeyboardShortcutPanel.css';

interface KeyboardShortcutPanelProps {
    visible: boolean;
    onClose: () => void;
    getContainer?: () => HTMLElement;
}

type ThemeToken = ReturnType<typeof theme.useToken>['token'];

interface ShortcutItem {
    keys: string[];
    label: string;
}

interface ShortcutGroup {
    title: string;
    items: ShortcutItem[];
}

const createShortcutGroups = (isMac: boolean, t: (key: string) => string): ShortcutGroup[] => [
    {
        title: t('designer.keyboardShortcuts.groups.general'),
        items: [
            { keys: [isMac ? '⌘' : 'Ctrl', 'Z'], label: t('designer.flowchartShortcuts.action.undo') },
            { keys: isMac ? ['⌘', 'Shift', 'Z'] : ['Ctrl', 'Y'], label: t('designer.flowchartShortcuts.action.redo') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'A'], label: t('designer.flowchartShortcuts.action.selectAll') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'C'], label: t('designer.flowchartShortcuts.action.copy') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'V'], label: t('designer.flowchartShortcuts.action.paste') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'X'], label: t('designer.flowchartShortcuts.action.cut') },
            { keys: ['Esc'], label: t('designer.keyboardShortcuts.actions.cancel') },
        ]
    },
    {
        title: t('designer.keyboardShortcuts.groups.nodes'),
        items: [
            { keys: ['Delete'], label: t('designer.flowchartShortcuts.action.delete') },
            { keys: ['Backspace'], label: t('designer.flowchartShortcuts.action.delete') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'D'], label: t('designer.flowchartShortcuts.action.duplicate') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'G'], label: t('designer.flowchartShortcuts.action.group') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'Shift', 'G'], label: t('designer.flowchartShortcuts.action.ungroup') },
            { keys: ['↑ ↓ ← →'], label: t('designer.flowchartShortcuts.action.nudge') },
            { keys: ['Shift', '↑ ↓ ← →'], label: t('designer.flowchartShortcuts.action.nudgeFast') },
        ]
    },
    {
        title: t('designer.keyboardShortcuts.groups.view'),
        items: [
            { keys: [isMac ? '⌘' : 'Ctrl', '+'], label: t('designer.keyboardShortcuts.actions.zoomIn') },
            { keys: [isMac ? '⌘' : 'Ctrl', '-'], label: t('designer.keyboardShortcuts.actions.zoomOut') },
            { keys: [isMac ? '⌘' : 'Ctrl', '0'], label: t('designer.keyboardShortcuts.actions.fitView') },
            { keys: [isMac ? '⌘' : 'Ctrl', '1'], label: t('designer.keyboardShortcuts.actions.actualSize') },
            { keys: [t('designer.keyboardShortcuts.keys.wheel')], label: t('designer.keyboardShortcuts.actions.zoomCanvas') },
        ]
    },
    {
        title: t('designer.keyboardShortcuts.groups.advanced'),
        items: [
            { keys: [isMac ? '⌘' : 'Ctrl', 'K'], label: t('designer.flowchartShortcuts.action.palette') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'Shift', 'F'], label: t('designer.shortcuts.action.menuSearch') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'Shift', 'B'], label: t('designer.shortcuts.action.menuToggle') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'Shift', 'D'], label: t('designer.shortcuts.action.debugToggle') },
            { keys: [isMac ? '⌘' : 'Ctrl', ','], label: t('designer.shortcuts.action.settings') },
            { keys: ['Esc'], label: t('designer.shortcuts.action.exitFullscreen') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'F'], label: t('designer.flowchartShortcuts.action.canvasSearch') },
            { keys: [isMac ? '⌘' : 'Ctrl', 'H'], label: t('designer.flowchartShortcuts.action.findReplace') },
            { keys: ['Alt', t('designer.keyboardShortcuts.keys.drag')], label: t('designer.flowchartShortcuts.action.duplicateDrag') },
            { keys: ['Shift', t('designer.keyboardShortcuts.keys.click')], label: t('designer.keyboardShortcuts.actions.multiSelect') },
            { keys: ['?'], label: t('designer.keyboardShortcuts.actions.showHelp') },
        ]
    },
];

const KeyBadge: React.FC<{ children: string; token: ThemeToken }> = ({ children, token }) => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 22,
        padding: '0 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        background: token.colorBgLayout,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorText,
        boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
    }}>
        {children}
    </span>
);

export const KeyboardShortcutPanel: React.FC<KeyboardShortcutPanelProps> = ({ visible, onClose, getContainer }) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [searchText, setSearchText] = useState('');
    const returnFocusRef = useRef<HTMLElement | null>(
        typeof document !== 'undefined'
        && document.activeElement instanceof HTMLElement
        && document.activeElement !== document.body
            ? document.activeElement
            : null,
    );
    const shortcutGroups = useMemo(() => createShortcutGroups(
        typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform),
        t,
    ), [t]);
    const filteredGroups = useMemo(() => {
        const normalizedSearch = searchText.trim().toLocaleLowerCase();
        if (!normalizedSearch) return shortcutGroups;

        return shortcutGroups
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => (
                    item.label.toLocaleLowerCase().includes(normalizedSearch)
                    || item.keys.join('+').toLocaleLowerCase().includes(normalizedSearch)
                )),
            }))
            .filter((group) => group.items.length > 0);
    }, [searchText, shortcutGroups]);

    const closePanel = useCallback(() => {
        const returnFocus = returnFocusRef.current;
        returnFocusRef.current = null;
        onClose();
        if (!returnFocus) return;
        window.setTimeout(() => {
            if (returnFocus.isConnected) returnFocus.focus();
        }, 0);
    }, [onClose]);

    useEffect(() => {
        if (!visible) return;

        let canCloseFromShortcut = false;
        queueMicrotask(() => {
            canCloseFromShortcut = true;
        });

        const handleShortcutPanelToggle = (event: KeyboardEvent) => {
            const isHelpShortcut = event.key === '?' || (event.key === '/' && event.shiftKey);
            if (!canCloseFromShortcut || !isHelpShortcut) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            closePanel();
        };

        window.addEventListener('keydown', handleShortcutPanelToggle, { capture: true });
        return () => window.removeEventListener('keydown', handleShortcutPanelToggle, { capture: true });
    }, [closePanel, visible]);

    return (
        <Modal
            title={<Space><FaKeyboard aria-hidden="true" />{t('designer.keyboardShortcuts.title')}</Space>}
            open={visible}
            onCancel={closePanel}
            footer={null}
            width={520}
            centered
            afterClose={() => setSearchText('')}
            rootClassName="keyboard-shortcut-panel"
            getContainer={getContainer}
            styles={{
                body: { maxHeight: '60vh', overflowY: 'auto', padding: '12px 0' },
            }}
        >
            <Input
                autoFocus
                aria-label={t('designer.keyboardShortcuts.searchLabel')}
                placeholder={t('designer.flowchartShortcuts.searchPlaceholder')}
                prefix={<SearchOutlined aria-hidden="true" />}
                allowClear={{
                    clearIcon: <AccessibleInputClearIcon label={t('designer.flowchartShortcuts.clearSearch')} />,
                }}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                style={{ margin: '0 24px 12px', width: 'calc(100% - 48px)' }}
            />

            {filteredGroups.map((group, gi) => (
                <div key={group.title} style={{ marginBottom: gi < filteredGroups.length - 1 ? 16 : 0 }}>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: token.colorTextSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '4px 24px 6px',
                    }}>
                        {group.title}
                    </div>
                    {group.items.map((item) => (
                        <div key={`${item.label}-${item.keys.join('-')}`} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 24px',
                            borderRadius: 4,
                            transition: 'background 0.15s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = token.colorBgTextHover}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ fontSize: 13, color: token.colorText }}>
                                {item.label}
                            </span>
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {item.keys.map((k, ki) => (
                                    <React.Fragment key={ki}>
                                        {ki > 0 && <span style={{ color: token.colorTextQuaternary, fontSize: 10 }}>+</span>}
                                        <KeyBadge token={token}>{k}</KeyBadge>
                                    </React.Fragment>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>
            ))}

            {filteredGroups.length === 0 && (
                <div role="status" style={{ padding: '28px 24px', textAlign: 'center', color: token.colorTextSecondary }}>
                    {t('designer.flowchartShortcuts.noResults')}
                </div>
            )}

            <div style={{
                textAlign: 'center',
                padding: '12px 24px 4px',
                fontSize: 11,
                color: token.colorTextQuaternary,
            }}>
                {t('designer.keyboardShortcuts.footer.press')} <KeyBadge token={token}>?</KeyBadge>{' '}
                {t('designer.keyboardShortcuts.footer.or')} <KeyBadge token={token}>Esc</KeyBadge>{' '}
                {t('designer.keyboardShortcuts.footer.close')}
            </div>
        </Modal>
    );
};
