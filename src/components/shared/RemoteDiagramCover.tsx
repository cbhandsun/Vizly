import React, { useEffect, useState } from 'react';
import { theme, Spin } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchRemoteDiagramPreview, type RemoteDiagramPreview } from '@/services/remoteDiagramPreview';

type PreviewStatus = 'loading' | 'ready' | 'unavailable';

export const RemoteDiagramCover: React.FC<{
  storageId: string;
  alt: string;
  height?: number;
  cacheBuster?: string | number;
}> = ({ storageId, alt, height = 140, cacheBuster }) => {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const [preview, setPreview] = useState<RemoteDiagramPreview | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setStatus('loading');
      setPreview(null);
      fetchRemoteDiagramPreview(storageId).then((p) => {
        if (cancelled) return;
        setPreview(p);
        setStatus(p ? 'ready' : 'unavailable');
      });
    };
    load();
    const onInvalidated = (e: Event) => {
      const ce = e as CustomEvent<{ id?: string }>;
      if (String(ce.detail?.id || '') !== String(storageId || '')) return;
      load();
    };
    window.addEventListener('remoteDiagramPreviewInvalidated', onInvalidated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('remoteDiagramPreviewInvalidated', onInvalidated as EventListener);
    };
  }, [storageId, cacheBuster]);

  return (
    <div
      className="remote-diagram-cover"
      data-preview-status={status}
      style={{
        height,
        width: '100%',
        background: token.colorFillQuaternary,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {preview ? (
        <img
          src={preview.dataUrl}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => {
            setPreview(null);
            setStatus('unavailable');
          }}
        />
      ) : (
        <div
          role="status"
          aria-live="polite"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: token.colorTextTertiary }}
        >
          {status === 'loading' ? <Spin size="small" /> : <PictureOutlined style={{ fontSize: 28 }} />}
          <span style={{ fontSize: 11 }}>
            {status === 'loading' ? t('workspace.previewLoading') : t('workspace.previewUnavailable')}
          </span>
        </div>
      )}
    </div>
  );
};

export default RemoteDiagramCover;
