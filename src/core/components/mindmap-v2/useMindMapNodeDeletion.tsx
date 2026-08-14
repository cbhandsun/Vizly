import React, { useCallback, useRef, useState } from 'react';
import { Alert, Modal } from 'antd';
import type { NodeObj, Topic } from 'mind-elixir';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { findNodeById } from './migrate';
import { cleanMindMapTopic } from './mindmapTreeSanitizer';

interface MindMapNodeDeleteMind {
    getData: () => { nodeData: NodeObj };
    findEle: (id: string) => Topic | null;
    selectNode: (topic: Topic) => void;
    removeNodes: (topics: Topic[]) => void;
}

interface MindMapNodeDeleteTarget {
    id: string;
    topic: string;
    descendantCount: number;
}

interface UseMindMapNodeDeletionOptions {
    mind: MindMapNodeDeleteMind | null;
    onDeleted?: (nodeId: string) => void;
    onFailure: (error: unknown) => void;
}

const MAX_COUNTED_DESCENDANTS = 10_000;

export const countMindMapDescendants = (node: NodeObj): number => {
    const pending = [...(node.children ?? [])];
    let count = 0;
    while (pending.length > 0 && count < MAX_COUNTED_DESCENDANTS) {
        const current = pending.pop();
        if (!current) continue;
        count += 1;
        pending.push(...(current.children ?? []));
    }
    return count;
};
export const useMindMapNodeDeletion = ({
    mind,
    onDeleted,
    onFailure,
}: UseMindMapNodeDeletionOptions) => {
    const { t } = useTranslation();
    const [target, setTarget] = useState<MindMapNodeDeleteTarget | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const pendingRef = useRef(false);
    const restoreFocusRef = useRef<HTMLElement | null>(null);

    const close = useCallback(() => {
        if (pendingRef.current) return;
        setTarget(null);
        setError('');
    }, []);

    const requestDelete = useCallback((node: NodeObj) => {
        if (!mind || pendingRef.current) return;
        const rootId = mind.getData().nodeData.id;
        if (!node.id || node.id === rootId) return;
        restoreFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setError('');
        setTarget({
            id: node.id,
            topic: cleanMindMapTopic(node.topic, t('plugins.mindmap.nodeDelete.untitled')),
            descendantCount: countMindMapDescendants(node),
        });
    }, [mind, t]);

    const confirmDelete = useCallback(async () => {
        if (!mind || !target || pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError('');
        try {
            const root = mind.getData().nodeData;
            const currentNode = findNodeById(root, target.id);
            const topicElement = mind.findEle(target.id);
            if (!currentNode || currentNode.id === root.id || !topicElement) {
                throw new Error('Mind map delete target is unavailable');
            }
            mind.selectNode(topicElement);
            mind.removeNodes([topicElement]);
            setTarget(null);
            appMessage.success(t('plugins.mindmap.nodeDelete.success'));
            onDeleted?.(target.id);
        } catch (caughtError) {
            onFailure(caughtError);
            setError(t('plugins.mindmap.nodeDelete.failed'));
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    }, [mind, onDeleted, onFailure, t, target]);

    const deleteDialog = (
        <Modal
            open={target !== null}
            title={target
                ? t('plugins.mindmap.nodeDelete.title', { topic: target.topic })
                : t('plugins.mindmap.nodeDelete.titleFallback')}
            okText={t('plugins.mindmap.nodeDelete.confirm')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            confirmLoading={pending}
            closable={!pending}
            mask={{ closable: !pending }}
            keyboard={!pending}
            destroyOnHidden
            onCancel={close}
            onOk={() => void confirmDelete()}
            afterClose={() => {
                requestAnimationFrame(() => restoreFocusRef.current?.focus());
            }}
        >
            <p>
                {target?.descendantCount
                    ? t('plugins.mindmap.nodeDelete.descriptionWithChildren', {
                        count: target.descendantCount,
                    })
                    : t('plugins.mindmap.nodeDelete.description')}
            </p>
            {error && <Alert type="error" showIcon message={error} role="alert" />}
        </Modal>
    );

    return {
        deleteDialog,
        isDeleteDialogOpen: target !== null,
        requestDelete,
    };
};
