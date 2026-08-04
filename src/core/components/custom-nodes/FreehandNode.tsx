import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';

import {
    coerceFreehandStroke,
    getFreehandSvgPath,
    type FreehandNodeData,
} from '../diagrams/freehandStrokeModel';

type FreehandNodeProps = NodeProps<Node<FreehandNodeData>>;

const FreehandNode = ({ data, selected }: FreehandNodeProps) => {
    const stroke = coerceFreehandStroke(data);
    if (!stroke) return null;

    return (
        <div
            role="img"
            aria-label="自由画笔笔迹"
            style={{
                width: '100%',
                height: '100%',
                borderRadius: 4,
                outline: selected ? '2px solid #6366f1' : 'none',
                outlineOffset: 2,
            }}
        >
            <svg
                aria-hidden="true"
                width="100%"
                height="100%"
                style={{ display: 'block', overflow: 'visible' }}
            >
                <path
                    d={getFreehandSvgPath(stroke)}
                    fill={stroke.color}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    );
};

export default memo(FreehandNode);
