import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Space from 'antd/es/space';
import { appModal } from '@vizly/core/antd';
import type { CoordinationProblem } from '../../../../server/collaboration/coordinationStatus';
import { CollaborationRecoveryError } from '../collaboration/collaborationRecoveryClient';

export function CollaborationRecoveryBanner({ problem, onSaveCopy, onRetry, onRestore }: {
  problem: CoordinationProblem;
  onSaveCopy: () => Promise<void>;
  onRetry: () => void;
  onRestore?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restoreFailure, setRestoreFailure] = useState<string | null>(null);
  const confirmationRef = useRef<ReturnType<typeof appModal.confirm> | null>(null);
  useEffect(() => () => { confirmationRef.current?.destroy(); }, []);
  const restore = () => {
    if (!onRestore || busy || confirmationRef.current) return;
    confirmationRef.current = appModal.confirm({
      title: t('collaboration.recovery.restoreTitle'),
      content: t('collaboration.recovery.restoreDescription'),
      okText: t('collaboration.recovery.restore'), cancelText: t('collaboration.recovery.keepEditing'),
      afterClose: () => { confirmationRef.current = null; },
      onOk: async () => {
        setBusy(true); setRestoreFailure(null);
        try { await onRestore(); }
        catch (error: unknown) {
          const code = error instanceof CollaborationRecoveryError ? error.code : 'unavailable';
          const failure = t(`collaboration.recovery.restoreErrors.${code}`);
          setRestoreFailure(failure);
          confirmationRef.current?.update({ content: <div><p>{t('collaboration.recovery.restoreDescription')}</p><p role="alert">{failure}</p></div> });
          throw new CollaborationRecoveryError(code);
        } finally { setBusy(false); }
      },
    });
  };
  const saveCopy = async () => {
    setBusy(true); setFailed(false);
    try { await onSaveCopy(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const retry = () => {
    appModal.confirm({
      title: t('collaboration.recovery.retryTitle'),
      content: t('collaboration.recovery.retryDescription'),
      okText: t('collaboration.recovery.retry'),
      cancelText: t('collaboration.recovery.keepEditing'),
      onOk: onRetry,
    });
  };
  return <div className="shrink-0" style={{ padding: '64px 12px 12px' }}>
    <Alert type="warning" showIcon
      message={t(problem === 'cloud-conflict' ? 'collaboration.recovery.conflictTitle' : 'collaboration.recovery.unavailableTitle')}
      description={<div>
        <p>{t('collaboration.recovery.description')}</p>
        {failed && <p role="alert">{t('collaboration.recovery.copyFailed')}</p>}
        {restoreFailure && <p role="alert">{restoreFailure}</p>}
        <Space wrap>
          <Button loading={busy} onClick={() => void saveCopy()}>{t('collaboration.recovery.saveCopy')}</Button>
          <Button disabled={busy} onClick={retry}>{t('collaboration.recovery.retry')}</Button>
          {onRestore && <Button disabled={busy} onClick={restore}>{t('collaboration.recovery.restore')}</Button>}
        </Space>
      </div>}
    />
  </div>;
}
