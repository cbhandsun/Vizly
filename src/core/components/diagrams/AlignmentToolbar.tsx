import React, { useCallback } from 'react';
import { Node } from '@xyflow/react';
import {
    FaAlignLeft, FaAlignCenter, FaAlignRight,
    FaAlignJustify, // Using for top/middle/bottom visual approx or rotate
    FaArrowsAltH, FaArrowsAltV
} from 'react-icons/fa';
import { MdAlignHorizontalLeft, MdAlignHorizontalCenter, MdAlignHorizontalRight, MdAlignVerticalTop, MdAlignVerticalCenter, MdAlignVerticalBottom } from 'react-icons/md';
import { useAlignment } from './hooks/useAlignment';
import './AlignmentToolbar.css';

interface AlignmentToolbarProps {
    selectedNodes: Node[];
    onUpdateNodes: (updates: { id: string, position: { x: number, y: number } }[]) => void;
}

const AlignmentToolbar: React.FC<AlignmentToolbarProps> = ({ selectedNodes, onUpdateNodes }) => {

    const { canAlign, canDistribute, handleAlign, handleDistribute } = useAlignment({ selectedNodes, onUpdateNodes });

    if (selectedNodes.length < 2) return null;

    return (
        <div className="alignment-toolbar">
            <div className="alignment-group">
                <IconButton onClick={() => handleAlign('left')} icon={<MdAlignHorizontalLeft />} title="Align Left" />
                <IconButton onClick={() => handleAlign('center')} icon={<MdAlignHorizontalCenter />} title="Align Center" />
                <IconButton onClick={() => handleAlign('right')} icon={<MdAlignHorizontalRight />} title="Align Right" />
            </div>
            <div className="alignment-divider" />
            <div className="alignment-group">
                <IconButton onClick={() => handleAlign('top')} icon={<MdAlignVerticalTop />} title="Align Top" />
                <IconButton onClick={() => handleAlign('middle')} icon={<MdAlignVerticalCenter />} title="Align Middle" />
                <IconButton onClick={() => handleAlign('bottom')} icon={<MdAlignVerticalBottom />} title="Align Bottom" />
            </div>
            <div className="alignment-divider" />
            <div className="alignment-group">
                <IconButton onClick={() => handleDistribute('horizontal')} icon={<FaArrowsAltH />} title="Distribute Horizontally" disabled={!canDistribute} />
                <IconButton onClick={() => handleDistribute('vertical')} icon={<FaArrowsAltV />} title="Distribute Vertically" disabled={!canDistribute} />
            </div>
        </div>
    );
};

const IconButton = ({ onClick, icon, title, disabled }: { onClick: () => void, icon: React.ReactNode, title: string, disabled?: boolean }) => (
    <button
        className="alignment-btn"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title}
    >
        {icon}
    </button>
);

export default AlignmentToolbar;
