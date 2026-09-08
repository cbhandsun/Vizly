import type { BaseReactFlowDisplayFailure } from './baseReactFlowDisplayFailure';
import { BaseReactFlowInitializationOverlay } from './BaseReactFlowInitializationOverlay';
import { summarizeDisplayRoutingFailure } from './baseReactFlowDisplayFailureSummary';

export const BaseReactFlowDisplayStatusOverlay = ({
  isContainerReady, failure,
}: Readonly<{ isContainerReady: boolean; failure: BaseReactFlowDisplayFailure | null }>) => (
  <>
    {!isContainerReady && <BaseReactFlowInitializationOverlay />}
    {failure && (
      <div role="status" aria-live="polite" data-display-routing-failure={failure.reason}
        style={{ position: 'absolute', top: 112, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, maxWidth: 'calc(100% - 32px)', padding: '10px 14px', borderRadius: 8,
          background: '#fffbeb', color: '#78350f', border: '1px solid #fcd34d', pointerEvents: 'none' }}>
        {failure.reason === 'quality-rejected'
          ? '当前位置暂时无法生成合规连线，已暂停显示连线。请调整节点或重新布局。'
          : '连线计算未能完成，已暂停显示连线。请调整节点或重新布局。'}
        <details className="nodrag nopan nowheel" style={{ pointerEvents: 'auto', marginTop: 6 }}>
          <summary style={{ cursor: 'pointer' }}>诊断摘要</summary>
          <textarea readOnly aria-label="连线失败诊断摘要" rows={7}
            value={JSON.stringify(summarizeDisplayRoutingFailure(failure), null, 2)}
            style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box',
              marginTop: 6, padding: 8, color: '#172033', background: '#fff', fontSize: 12 }} />
        </details>
      </div>
    )}
  </>
);
