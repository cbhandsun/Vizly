import React, { useEffect, useRef } from 'react';
import { Button, Progress, theme } from 'antd';
import { FaSpinner } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import type { DiagramExportType } from '@/core/hooks/diagramExportActions';

interface ExportProgressOverlayProps {
  exportType: DiagramExportType | null;
  progress: number;
  cancelling: boolean;
  onCancel: () => void;
}

export const ExportProgressOverlay: React.FC<ExportProgressOverlayProps> = ({
  exportType,
  progress,
  cancelling,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const format = exportType?.toUpperCase() ?? '';

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      (cancelling ? dialogRef.current : cancelButtonRef.current)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !cancelling) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        (cancelling ? dialogRef.current : cancelButtonRef.current)?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [cancelling, onCancel]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagram-export-progress-title"
      aria-describedby="diagram-export-progress-description"
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        background: token.colorBgMask,
        backdropFilter: 'blur(4px)',
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          minWidth: 320,
          maxWidth: 'calc(100vw - 32px)',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorder}`,
        }}
      >
        <FaSpinner className="animate-spin" size={32} style={{ color: token.colorPrimary }} aria-hidden="true" />
        <div id="diagram-export-progress-title" style={{ color: token.colorText, fontWeight: 600 }}>
          {cancelling
            ? t('export.cancelling', { format })
            : t('export.progress', { format })}
        </div>
        {exportType === 'gif' && (
          <div style={{ width: 256 }}>
            <Progress percent={Math.round(progress * 100)} size="small" status="active" />
          </div>
        )}
        <div
          id="diagram-export-progress-description"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy="true"
          style={{ maxWidth: 300, textAlign: 'center', fontSize: 12, color: token.colorTextSecondary }}
        >
          {cancelling ? t('export.cancellingWait') : t('export.wait')}
        </div>
        <Button ref={cancelButtonRef} danger disabled={cancelling} onClick={onCancel}>
          {t('export.cancel')}
        </Button>
      </div>
    </div>
  );
};
