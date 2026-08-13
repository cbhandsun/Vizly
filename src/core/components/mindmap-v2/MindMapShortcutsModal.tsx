import { useMemo, type ReactNode } from 'react';
import {
    ApartmentOutlined,
    CompassOutlined,
    HistoryOutlined,
    InfoCircleOutlined,
    KeyOutlined,
    PlayCircleOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import './MindMapShortcutsModal.css';

interface ShortcutItem {
    action: string;
    chords: string[][];
}

interface ShortcutGroup {
    id: string;
    icon: ReactNode;
    title: string;
    items: ShortcutItem[];
}

interface MindMapShortcutsModalProps {
    open: boolean;
    onClose: () => void;
}

const KeyBadge = ({ label }: { label: string }) => (
    <kbd aria-hidden="true" className="mindmap-shortcuts-key">
        {label}
    </kbd>
);

const ShortcutKeys = ({ chords, orLabel }: { chords: string[][]; orLabel: string }) => (
    <span aria-hidden="true" className="mindmap-shortcuts-keys">
        {chords.map((chord, chordIndex) => (
            <span className="mindmap-shortcuts-chord" key={chord.join('-')}>
                {chordIndex > 0 && <span className="mindmap-shortcuts-or">{orLabel}</span>}
                {chord.map((key, keyIndex) => (
                    <span className="mindmap-shortcuts-key-part" key={key}>
                        {keyIndex > 0 && <span className="mindmap-shortcuts-plus">+</span>}
                        <KeyBadge label={key} />
                    </span>
                ))}
            </span>
        ))}
    </span>
);

const MindMapShortcutsModal = ({ open, onClose }: MindMapShortcutsModalProps) => {
    const { t } = useTranslation();
    const mod = t('plugins.mindmap.shortcutHelp.keys.mod');
    const orLabel = t('plugins.mindmap.shortcutHelp.or');

    const groups = useMemo<ShortcutGroup[]>(() => [
        {
            id: 'nodes',
            icon: <ApartmentOutlined />,
            title: t('plugins.mindmap.shortcutHelp.groups.nodes'),
            items: [
                { chords: [['Tab']], action: t('plugins.mindmap.shortcutHelp.actions.addChild') },
                { chords: [['Enter']], action: t('plugins.mindmap.shortcutHelp.actions.addSiblingAfter') },
                { chords: [['Shift', 'Enter']], action: t('plugins.mindmap.shortcutHelp.actions.addSiblingBefore') },
                { chords: [[mod, 'Enter']], action: t('plugins.mindmap.shortcutHelp.actions.insertParent') },
                { chords: [['F2']], action: t('plugins.mindmap.shortcutHelp.actions.editNode') },
                { chords: [['Delete'], ['Backspace']], action: t('plugins.mindmap.shortcutHelp.actions.deleteNode') },
                { chords: [[mod, 'Shift', 'C']], action: t('plugins.mindmap.shortcutHelp.actions.copyNodeText') },
            ],
        },
        {
            id: 'view',
            icon: <CompassOutlined />,
            title: t('plugins.mindmap.shortcutHelp.groups.view'),
            items: [
                { chords: [[mod, 'F']], action: t('plugins.mindmap.shortcutHelp.actions.search') },
                { chords: [['Alt', 'O']], action: t('plugins.mindmap.shortcutHelp.actions.outline') },
                { chords: [['Alt', 'H']], action: t('plugins.mindmap.shortcutHelp.actions.history') },
                { chords: [[t('plugins.mindmap.shortcutHelp.keys.arrowKeys')]], action: t('plugins.mindmap.shortcutHelp.actions.navigateNodes') },
            ],
        },
        {
            id: 'history',
            icon: <HistoryOutlined />,
            title: t('plugins.mindmap.shortcutHelp.groups.history'),
            items: [
                { chords: [[mod, 'Z']], action: t('plugins.mindmap.shortcutHelp.actions.undo') },
                { chords: [[mod, 'Y'], [mod, 'Shift', 'Z']], action: t('plugins.mindmap.shortcutHelp.actions.redo') },
            ],
        },
        {
            id: 'presentation',
            icon: <PlayCircleOutlined />,
            title: t('plugins.mindmap.shortcutHelp.groups.presentation'),
            items: [
                { chords: [['→'], ['↓'], [t('plugins.mindmap.shortcutHelp.keys.space')], ['Enter']], action: t('plugins.mindmap.shortcutHelp.actions.nextNode') },
                { chords: [['←'], ['↑']], action: t('plugins.mindmap.shortcutHelp.actions.previousNode') },
                { chords: [['Esc']], action: t('plugins.mindmap.shortcutHelp.actions.exitPresentation') },
            ],
        },
        {
            id: 'quick-actions',
            icon: <ThunderboltOutlined />,
            title: t('plugins.mindmap.shortcutHelp.groups.quickActions'),
            items: [
                { chords: [[mod, t('plugins.mindmap.shortcutHelp.keys.click')]], action: t('plugins.mindmap.shortcutHelp.actions.openLink') },
                { chords: [[t('plugins.mindmap.shortcutHelp.keys.rightClick')]], action: t('plugins.mindmap.shortcutHelp.actions.contextMenu') },
                { chords: [[t('plugins.mindmap.shortcutHelp.keys.dragFiles')]], action: t('plugins.mindmap.shortcutHelp.actions.importFiles') },
            ],
        },
    ], [mod, t]);

    return (
        <Modal
            centered
            footer={null}
            onCancel={onClose}
            open={open}
            rootClassName="mindmap-shortcuts-modal"
            title={(
                <span className="mindmap-shortcuts-title">
                    <KeyOutlined aria-hidden="true" />
                    <span>{t('plugins.mindmap.shortcutHelp.title')}</span>
                </span>
            )}
            width={760}
        >
            <p className="mindmap-shortcuts-subtitle" id="mindmap-shortcuts-description">
                {t('plugins.mindmap.shortcutHelp.subtitle')}
            </p>
            <div aria-describedby="mindmap-shortcuts-description" className="mindmap-shortcuts-grid">
                {groups.map(group => (
                    <section aria-labelledby={`mindmap-shortcuts-${group.id}`} className="mindmap-shortcuts-group" key={group.id}>
                        <h3 className="mindmap-shortcuts-group-title" id={`mindmap-shortcuts-${group.id}`}>
                            <span aria-hidden="true" className="mindmap-shortcuts-group-icon">{group.icon}</span>
                            {group.title}
                        </h3>
                        <div className="mindmap-shortcuts-list" role="list">
                            {group.items.map(item => {
                                const shortcut = item.chords.map(chord => chord.join('+')).join(` ${orLabel} `);
                                return (
                                    <div
                                        aria-label={t('plugins.mindmap.shortcutHelp.itemLabel', { action: item.action, shortcut })}
                                        className="mindmap-shortcuts-item"
                                        key={`${group.id}-${item.action}`}
                                        role="listitem"
                                    >
                                        <span className="mindmap-shortcuts-action">{item.action}</span>
                                        <ShortcutKeys chords={item.chords} orLabel={orLabel} />
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
            <p className="mindmap-shortcuts-note">
                <InfoCircleOutlined aria-hidden="true" />
                <span>{t('plugins.mindmap.shortcutHelp.note')}</span>
            </p>
        </Modal>
    );
};

export default MindMapShortcutsModal;
