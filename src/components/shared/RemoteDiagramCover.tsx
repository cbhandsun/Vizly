import React, { useEffect, useState } from 'react';
import { theme, Spin, Image } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { fetchRemoteDiagramPreview, type RemoteDiagramPreview } from '@/core';

export const RemoteDiagramCover: React.FC<{
  storageId: string;
  alt: string;
  height?: number;
  cacheBuster?: string | number;
}> = ({ storageId, alt, height = 140, cacheBuster }) => {
  const { token } = theme.useToken();
  const [preview, setPreview] = useState<RemoteDiagramPreview | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoaded(false);
      setPreview(null);
      fetchRemoteDiagramPreview(storageId).then((p) => {
        if (cancelled) return;
        setPreview(p);
        setLoaded(true);
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
        <Image
          src={preview.dataUrl}
          alt={alt}
          preview={true}
          wrapperStyle={{ width: '100%', height: '100%' }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: token.colorTextTertiary }}>
          {!loaded ? <Spin size="small" /> : <PictureOutlined style={{ fontSize: 28 }} />}
        </div>
      )}
    </div>
  );
};

export default RemoteDiagramCover;
