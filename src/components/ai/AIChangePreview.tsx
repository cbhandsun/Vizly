import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import { buildAIChangePlan, type AICanvasGraph, type AIApplyStrategy, type AIChangePlan, type AIEditContext } from './aiCanvasEdit';

interface Props {
    before: AICanvasGraph;
    generated: AICanvasGraph;
    context?: AIEditContext;
    onApply: (plan: AIChangePlan) => void;
    onClose: () => void;
}

export function AIChangePreview({ before, generated, context, onApply, onClose }: Props) {
    const { t } = useTranslation();
    const [strategy, setStrategy] = useState<AIApplyStrategy>(context ? 'edit' : 'append');
    const [error, setError] = useState('');
    const applied = useRef(false);
    const result = useMemo(() => {
        try { return { plan: buildAIChangePlan(before, generated, strategy, context) }; }
        catch (failure) { return { error: failure instanceof Error ? failure.message : 'aiChat.edit.invalid' }; }
    }, [before, generated, strategy, context]);
    const changes = result.plan?.changes ?? [];
    return <div className="ai-change-preview">
        {context ? <p>{t(`aiChat.edit.scope.${context.scope}`)} · {context.nodeIds.length} {t('aiChat.edit.nodes')}</p>
            : <Select aria-label={t('aiChat.edit.strategy')} value={strategy} onChange={setStrategy}
                getPopupContainer={trigger => trigger.parentElement ?? trigger}
                style={{ minWidth: 200 }} options={['append', 'replace'].map(value => ({ value, label: t(value === 'append' ? 'aiChat.edit.strategyAppend' : 'aiChat.edit.strategyReplace') }))} />}
        <p>{t('aiChat.edit.summary', {
            added: changes.filter(change => change.action === 'add').length,
            updated: changes.filter(change => change.action === 'update').length,
            removed: changes.filter(change => change.action === 'remove').length,
        })}</p>
        <div style={{ maxHeight: '45vh', overflow: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', overflowWrap: 'anywhere' }}>
                <thead><tr>{['action', 'before', 'after'].map(key => <th key={key}>{t(`aiChat.edit.${key}`)}</th>)}</tr></thead>
                <tbody>{changes.map(change => <tr key={`${change.kind}:${change.id}`}>
                    <td style={{ minWidth: 100 }}>{t(`aiChat.edit.${change.action}`)} {t(`aiChat.edit.${change.kind}`)}</td>
                    <td>{change.before ?? '—'}<small style={{ display: 'block', opacity: 0.6 }}>{change.id}</small></td>
                    <td>{change.after ?? '—'}</td>
                </tr>)}</tbody>
            </table>
        </div>
        <p>{t('aiChat.edit.undoHint')}</p>
        {(error || result.error) && <Alert type="error" showIcon title={t(error || result.error!)} />}
        <Space style={{ marginTop: 16 }}>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="primary" disabled={!result.plan || !changes.length} onClick={() => {
                if (!result.plan || applied.current) return;
                applied.current = true;
                try { onApply(result.plan); onClose(); }
                catch (failure) { applied.current = false; setError(failure instanceof Error ? failure.message : 'aiChat.edit.invalid'); }
            }}>{t('aiChat.edit.confirm')}</Button>
        </Space>
    </div>;
}
