import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import {
    CloseOutlined,
    PictureOutlined,
    SmileOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { toSafeImageUrl } from '../../utils/sanitizeHtml';
import { logMindmapPropertyImageUploadRejected } from './mindmapPanelLogging';
import { PropertyRow as Row } from './MindMapPropertyPanelControls';
import {
    readMindMapPropertyImageFile,
    type MindMapPropertyImageImportError,
} from './mindMapPropertyImageImport';
import styles from './MindMapPropertyMediaControls.module.css';

const ICON_GROUPS: Readonly<Record<string, readonly string[]>> = {
    priority: ['🔥', '⭐', '❗', '❓', '💡', '🎯', '🏆', '💎'],
    status: ['✅', '❌', '⚠️', '🔄', '⏳', '📌', '🔒', '🔓'],
    people: ['👤', '👥', '🤝', '💬', '❤️', '👍', '👎', '👏'],
    objects: ['📁', '📄', '📊', '📈', '🔗', '🔧', '⚙️', '🔍'],
} as const;

const imageErrorTranslationKey = (error: MindMapPropertyImageImportError): string => ({
    'empty-file': 'plugins.mindmap.propertyMedia.emptyFile',
    'invalid-file': 'plugins.mindmap.propertyMedia.invalidFile',
    'read-failed': 'plugins.mindmap.propertyMedia.readFailed',
    'unsafe-content': 'plugins.mindmap.propertyMedia.unsafeContent',
}[error]);

interface MindMapPropertyMediaControlsProps {
    icons: string[];
    imageUrl: string;
    onIconToggle: (icon: string) => void;
    onImageChange: (url: string) => void;
    onImageUrlCommit: () => boolean;
    onImageUrlInput: (url: string) => void;
}

export const MindMapPropertyMediaControls: React.FC<MindMapPropertyMediaControlsProps> = ({
    icons,
    imageUrl,
    onIconToggle,
    onImageChange,
    onImageUrlCommit,
    onImageUrlInput,
}) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const iconPickerId = useId();
    const safePreviewUrl = toSafeImageUrl(imageUrl);
    const mountedRef = useRef(true);

    useEffect(() => () => {
        mountedRef.current = false;
    }, []);

    const commitImageUrl = () => {
        setError(onImageUrlCommit() ? '' : t('plugins.mindmap.propertyMedia.invalidUrl'));
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || uploading) return;
        setUploading(true);
        setError('');
        const result = await readMindMapPropertyImageFile(file);
        if (!mountedRef.current) return;
        setUploading(false);
        if (!result.ok) {
            logMindmapPropertyImageUploadRejected(result.error);
            setError(t(imageErrorTranslationKey(result.error)));
            return;
        }
        onImageChange(result.url);
    };

    return (
        <>
            <Row label={t('plugins.mindmap.propertyMedia.iconsLabel')}>
                {icons.length > 0 && (
                    <ul className={styles.selectedIcons} aria-label={t('plugins.mindmap.propertyMedia.selectedIcons')}>
                        {icons.map(icon => (
                            <li key={icon}>
                                <button
                                    type="button"
                                    className={styles.selectedIcon}
                                    onClick={() => onIconToggle(icon)}
                                    aria-label={t('plugins.mindmap.propertyMedia.removeIcon', { icon })}
                                >
                                    <span aria-hidden="true">{icon}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <Popover
                    trigger="click"
                    placement="left"
                    open={iconPickerOpen}
                    onOpenChange={setIconPickerOpen}
                    title={t('plugins.mindmap.propertyMedia.iconPickerTitle')}
                    content={(
                        <div id={iconPickerId} className={styles.iconPicker} role="dialog" aria-label={t('plugins.mindmap.propertyMedia.iconPickerTitle')}>
                            {Object.entries(ICON_GROUPS).map(([group, groupIcons]) => (
                                <section key={group} aria-label={t(`plugins.mindmap.propertyMedia.iconGroups.${group}`)}>
                                    <div className={styles.iconGroupLabel}>{t(`plugins.mindmap.propertyMedia.iconGroups.${group}`)}</div>
                                    <div className={styles.iconGrid}>
                                        {groupIcons.map(icon => {
                                            const selected = icons.includes(icon);
                                            return (
                                                <button
                                                    type="button"
                                                    key={icon}
                                                    className={styles.iconChoice}
                                                    aria-pressed={selected}
                                                    aria-label={t(selected
                                                        ? 'plugins.mindmap.propertyMedia.removeIcon'
                                                        : 'plugins.mindmap.propertyMedia.addIcon', { icon })}
                                                    onClick={() => onIconToggle(icon)}
                                                >
                                                    <span aria-hidden="true">{icon}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                >
                    <Button
                        size="small"
                        icon={<SmileOutlined aria-hidden="true" />}
                        className={styles.fullWidthAction}
                        aria-haspopup="dialog"
                        aria-expanded={iconPickerOpen}
                        aria-controls={iconPickerId}
                    >
                        {icons.length > 0
                            ? t('plugins.mindmap.propertyMedia.iconsSelected', { count: icons.length })
                            : t('plugins.mindmap.propertyMedia.addIcons')}
                    </Button>
                </Popover>
            </Row>

            <Row label={t('plugins.mindmap.propertyMedia.imageLabel')}>
                <div className={styles.imageControls}>
                    <Input
                        prefix={<PictureOutlined aria-hidden="true" />}
                        aria-label={t('plugins.mindmap.propertyMedia.imageUrlLabel')}
                        placeholder={t('plugins.mindmap.propertyMedia.imageUrlPlaceholder')}
                        value={imageUrl}
                        size="small"
                        onChange={event => onImageUrlInput(event.target.value)}
                        onBlur={commitImageUrl}
                        onPressEnter={commitImageUrl}
                    />
                    <button
                        type="button"
                        className={styles.uploadButton}
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        aria-label={t('plugins.mindmap.propertyMedia.uploadImage')}
                    >
                        <UploadOutlined aria-hidden="true" />
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                        tabIndex={-1}
                        className={styles.fileInput}
                        onChange={event => { void handleFileChange(event); }}
                    />
                </div>
                {error && <div className={styles.error} role="alert">{error}</div>}
                {safePreviewUrl && (
                    <div className={styles.preview}>
                        <img src={safePreviewUrl} alt={t('plugins.mindmap.propertyMedia.previewAlt')} />
                        <button
                            type="button"
                            className={styles.removeImage}
                            onClick={() => { setError(''); onImageChange(''); }}
                            aria-label={t('plugins.mindmap.propertyMedia.removeImage')}
                        >
                            <CloseOutlined aria-hidden="true" />
                        </button>
                    </div>
                )}
            </Row>
        </>
    );
};
