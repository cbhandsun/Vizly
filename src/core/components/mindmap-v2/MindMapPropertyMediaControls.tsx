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

const imageErrorTranslationKey = (
    error: Exclude<MindMapPropertyImageImportError, 'aborted'>,
): string => ({
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
    const uploadButtonRef = useRef<HTMLButtonElement>(null);
    const iconPickerTriggerRef = useRef<HTMLButtonElement>(null);
    const activeUploadRef = useRef<AbortController | null>(null);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const iconPickerId = useId();
    const safePreviewUrl = toSafeImageUrl(imageUrl);
    const mountedRef = useRef(true);

    useEffect(() => () => {
        mountedRef.current = false;
        activeUploadRef.current?.abort();
        activeUploadRef.current = null;
    }, []);

    const handleIconPickerOpenChange = (open: boolean) => {
        setIconPickerOpen(open);
        if (!open) {
            requestAnimationFrame(() => iconPickerTriggerRef.current?.focus({ preventScroll: true }));
        }
    };

    const commitImageUrl = () => {
        setError(onImageUrlCommit() ? '' : t('plugins.mindmap.propertyMedia.invalidUrl'));
    };

    const cancelImageUpload = () => {
        const controller = activeUploadRef.current;
        activeUploadRef.current = null;
        controller?.abort();
        setUploading(false);
        setError('');
        requestAnimationFrame(() => uploadButtonRef.current?.focus({ preventScroll: true }));
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || activeUploadRef.current) return;
        const uploadController = new AbortController();
        activeUploadRef.current = uploadController;
        setUploading(true);
        setError('');
        const result = await readMindMapPropertyImageFile(
            file,
            undefined,
            undefined,
            uploadController.signal,
        );
        if (activeUploadRef.current !== uploadController) return;
        activeUploadRef.current = null;
        if (!mountedRef.current) return;
        setUploading(false);
        if (!result.ok) {
            if (result.error === 'aborted') {
                return;
            }
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
                    onOpenChange={handleIconPickerOpenChange}
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
                        ref={iconPickerTriggerRef}
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
                <div className={styles.imageControls} aria-busy={uploading}>
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
                        ref={uploadButtonRef}
                        type="button"
                        className={styles.uploadButton}
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        aria-label={t(uploading
                            ? 'plugins.mindmap.propertyMedia.uploadingImage'
                            : 'plugins.mindmap.propertyMedia.uploadImage')}
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
                {uploading && (
                    <div className={styles.uploadStatus} role="status" aria-live="polite">
                        <span>{t('plugins.mindmap.propertyMedia.uploadingImage')}</span>
                        <button
                            type="button"
                            className={styles.cancelUpload}
                            onClick={cancelImageUpload}
                            aria-label={t('plugins.mindmap.propertyMedia.cancelUpload')}
                        >
                            {t('plugins.mindmap.propertyMedia.cancelUpload')}
                        </button>
                    </div>
                )}
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
