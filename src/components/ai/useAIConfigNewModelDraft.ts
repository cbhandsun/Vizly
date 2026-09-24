import { useCallback, useState } from 'react';
import type { AIConfigModelDraft } from './aiConfigModelDraft';

const EMPTY_MODEL_DRAFT: AIConfigModelDraft = { id: '', name: '', group: '' };

export const useAIConfigNewModelDraft = () => {
    const [visible, setVisible] = useState(false);
    const [draft, setDraft] = useState<AIConfigModelDraft>(EMPTY_MODEL_DRAFT);

    const show = useCallback(() => {
        setDraft(EMPTY_MODEL_DRAFT);
        setVisible(true);
    }, []);

    const reset = useCallback(() => {
        setVisible(false);
        setDraft(EMPTY_MODEL_DRAFT);
    }, []);

    return { visible, draft, setDraft, show, reset };
};
