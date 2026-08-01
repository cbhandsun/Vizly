import React, { useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    MdAlignHorizontalCenter,
    MdAlignHorizontalLeft,
    MdAlignHorizontalRight,
    MdAlignVerticalBottom,
    MdAlignVerticalCenter,
    MdAlignVerticalTop,
    MdHorizontalDistribute,
    MdVerticalDistribute,
} from 'react-icons/md';

type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type DistributionType = 'horizontal' | 'vertical';

interface FlowchartAlignmentToolsProps {
    isMobile: boolean;
    selectedNodesCount: number;
    onAlign?: (type: AlignmentType) => void;
    onDistribute?: (type: DistributionType) => void;
}

const BUTTON_CLASS_NAME = 'w-8 h-8 p-0 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors';
const TOUCH_TARGET = 'var(--commercial-touch-target, 44px)';

export const FlowchartAlignmentTools: React.FC<FlowchartAlignmentToolsProps> = ({
    isMobile,
    selectedNodesCount,
    onAlign,
    onDistribute,
}) => {
    const { t } = useTranslation();
    const mobileButtonStyle = useMemo<React.CSSProperties | undefined>(() => (
        isMobile
            ? { minWidth: TOUCH_TARGET, width: TOUCH_TARGET, height: TOUCH_TARGET, padding: 0 }
            : undefined
    ), [isMobile]);

    const alignmentButtons = [
        { type: 'left' as const, label: t('toolbar.alignL', '左对齐'), icon: <MdAlignHorizontalLeft className="text-[16px]" /> },
        { type: 'center' as const, label: t('toolbar.alignC', '水平居中'), icon: <MdAlignHorizontalCenter className="text-[16px]" /> },
        { type: 'right' as const, label: t('toolbar.alignR', '右对齐'), icon: <MdAlignHorizontalRight className="text-[16px]" /> },
        { type: 'top' as const, label: t('toolbar.alignT', '顶对齐'), icon: <MdAlignVerticalTop className="text-[16px]" /> },
        { type: 'middle' as const, label: t('toolbar.alignM', '垂直居中'), icon: <MdAlignVerticalCenter className="text-[16px]" /> },
        { type: 'bottom' as const, label: t('toolbar.alignB', '底对齐'), icon: <MdAlignVerticalBottom className="text-[16px]" /> },
    ];
    const distributionButtons = [
        { type: 'horizontal' as const, label: t('toolbar.distributeH', '水平均分'), icon: <MdHorizontalDistribute className="text-[16px]" /> },
        { type: 'vertical' as const, label: t('toolbar.distributeV', '垂直均分'), icon: <MdVerticalDistribute className="text-[16px]" /> },
    ];

    const renderButton = (item: { type: AlignmentType | DistributionType; label: string; icon: React.ReactNode }, onClick: () => void) => (
        <Tooltip key={item.type} title={item.label}>
            <Button
                type="text"
                size="small"
                icon={item.icon}
                aria-label={item.label}
                onClick={onClick}
                className={BUTTON_CLASS_NAME}
                style={mobileButtonStyle}
            />
        </Tooltip>
    );

    return (
        <div className="flex items-center gap-1.5 h-full" aria-label="多选对齐与分布" role="toolbar">
            <div className="flex items-center gap-1 px-1">
                {alignmentButtons.slice(0, 3).map(item => renderButton(item, () => onAlign?.(item.type)))}
            </div>
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />
            <div className="flex items-center gap-1 px-1">
                {alignmentButtons.slice(3).map(item => renderButton(item, () => onAlign?.(item.type)))}
            </div>
            {selectedNodesCount > 2 ? (
                <>
                    <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />
                    <div className="flex items-center gap-1 px-1">
                        {distributionButtons.map(item => renderButton(item, () => onDistribute?.(item.type)))}
                    </div>
                </>
            ) : null}
        </div>
    );
};
