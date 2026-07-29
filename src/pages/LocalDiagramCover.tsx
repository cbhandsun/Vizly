import React, { useMemo } from 'react';
import { PictureOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { buildLocalDiagramPreview } from './localDiagramPreview';

interface LocalDiagramCoverProps {
  diagram: StandardDiagramData;
  alt: string;
  fallback: React.ReactNode;
}

const LocalDiagramCover = ({
  diagram,
  alt,
  fallback,
}: LocalDiagramCoverProps) => {
  const { t } = useTranslation();
  const preview = useMemo(() => buildLocalDiagramPreview(diagram), [diagram]);

  if (!preview) {
    return (
      <div
        className="local-diagram-cover-empty"
        role="img"
        aria-label={`${alt}: ${t('workspace.previewUnavailable')}`}
      >
        {fallback ?? <PictureOutlined />}
      </div>
    );
  }

  return (
    <img
      className="local-diagram-cover-image"
      src={preview.dataUrl}
      alt={alt}
      draggable={false}
    />
  );
};

export default LocalDiagramCover;
