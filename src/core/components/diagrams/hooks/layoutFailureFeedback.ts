import type { MessageInstance } from 'antd/es/message/interface';
import {
    classifyDisplayLayoutTransactionError,
    type DisplayLayoutTransactionErrorCode,
} from '../../shared/baseReactFlowDisplayRoutingDebug';
import { logLayoutStrategyFailure } from './diagramInteractionLogging';

export type LayoutFailureMessageApi = Pick<MessageInstance, 'open'>;
export type LayoutFailureTranslator = (key: string) => string;

export function reportLayoutFailure({ error, strategyName, isCurrent, onFailure }: {
    error: unknown;
    strategyName: string;
    isCurrent: boolean;
    onFailure?: (code: DisplayLayoutTransactionErrorCode) => void;
}): void {
    const code = classifyDisplayLayoutTransactionError(error);
    if (!isCurrent || code === 'cancelled') return;
    logLayoutStrategyFailure(strategyName, new Error(code));
    onFailure?.(code);
}

const fallbackMessages: Record<Exclude<DisplayLayoutTransactionErrorCode, 'cancelled'>, string> = {
    'no-layoutable-nodes': '当前没有可布局的节点。',
    'hard-quality-rejected': '此布局未满足连线质量要求，已保留原画布。请调整节点或选择其他布局。',
    'worker-timeout': '布局计算超时，已保留原画布。请稍后重试。',
    'strategy-failed': '布局计算失败，已保留原画布。请重试或选择其他布局。',
};

const messageKeys: Record<Exclude<DisplayLayoutTransactionErrorCode, 'cancelled'>, string> = {
    'no-layoutable-nodes': 'designer.flowchart.layout.failure.noLayoutableNodes',
    'hard-quality-rejected': 'designer.flowchart.layout.failure.hardQualityRejected',
    'worker-timeout': 'designer.flowchart.layout.failure.workerTimeout',
    'strategy-failed': 'designer.flowchart.layout.failure.strategyFailed',
};

export function getLayoutFailureMessageKey(
    code: Exclude<DisplayLayoutTransactionErrorCode, 'cancelled'>,
): string {
    return messageKeys[code];
}

/** Only bounded reason codes cross into presentation; never expose an exception payload. */
export function presentLayoutFailure(
    messageApi: LayoutFailureMessageApi | undefined,
    code: DisplayLayoutTransactionErrorCode,
    translate?: LayoutFailureTranslator,
): void {
    if (code === 'cancelled') return;
    const key = getLayoutFailureMessageKey(code);
    messageApi?.open({
        key: 'flowchart.layout-failure',
        type: code === 'no-layoutable-nodes' ? 'info' : 'error',
        content: translate ? translate(key) : fallbackMessages[code],
        duration: 5,
    });
}
