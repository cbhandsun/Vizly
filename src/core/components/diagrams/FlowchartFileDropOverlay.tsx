import { FaFileImport } from 'react-icons/fa';
import type { TFunction } from 'i18next';

export function FlowchartFileDropOverlay({ t }: { t: TFunction }) {
    return (
        <div className="flowchart-file-drop-overlay" role="status" aria-live="polite">
            <div className="flowchart-file-drop-card">
                <FaFileImport aria-hidden="true" />
                <strong>{t('designer.flowchart.import.dropTitle', '松开以导入文件')}</strong>
                <span>{t(
                    'designer.flowchart.import.dropDescription',
                    '支持 JSON 与 Mermaid；替换当前页面前会再次确认。',
                )}</span>
            </div>
        </div>
    );
}
