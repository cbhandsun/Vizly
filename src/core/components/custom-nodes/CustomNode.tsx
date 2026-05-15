import React, { useState } from 'react';
import { NodeProps, Node } from '@xyflow/react';
import { useCustomNodeInteractions } from './hooks/useCustomNodeInteractions';
import { useCustomNodeStyleResolution } from './hooks/useCustomNodeStyleResolution';
import { CustomNodeGraphics } from './renderers/CustomNodeGraphics';
import './PremiumNodeStyles.css';

export interface CustomNodeProps extends Partial<NodeProps<any>> {
    data: any;
    width?: number;
    height?: number;
}

const CustomNode: React.FC<CustomNodeProps> = ({ data, selected, id, width: propsWidth, height: propsHeight }) => {
    const [hovered, setHovered] = useState(false);

    // Domain Controllers
    const interactions = useCustomNodeInteractions({
        id: id as string,
        data,
        propsWidth
    });

    const styleResolution = useCustomNodeStyleResolution({
        id: id as string,
        data,
        selected: !!selected,
        hovered,
        nodeWidth: interactions.nodeWidth
    });

    return (
        <CustomNodeGraphics
            id={id as string}
            data={data}
            selected={!!selected}
            setHovered={setHovered}
            isEditing={interactions.isEditing}
            editText={interactions.editText}
            setEditText={interactions.setEditText}
            handleDoubleClick={interactions.handleDoubleClick}
            handleBlur={interactions.handleBlur}
            handleKeyDown={interactions.handleKeyDown}
            debugEnabled={styleResolution.debugEnabled}
            domainKey={styleResolution.domainKey as string}
            themeMain={styleResolution.themeMain}
            themeBorder={styleResolution.themeBorder}
            containerStyle={styleResolution.containerStyle}
            contentStyle={styleResolution.contentStyle}
            textContainerStyle={styleResolution.textContainerStyle}
            getLineStyle={styleResolution.getLineStyle}
            accentBarProps={styleResolution.accentBarProps}
            statusStripeProps={styleResolution.statusStripeProps}
            resolvedIcon={styleResolution.resolvedIcon}
        />
    );
};

const arePropsEqual = (prevProps: CustomNodeProps, nextProps: CustomNodeProps) => {
    // Basic props
    if (prevProps.selected !== nextProps.selected || prevProps.id !== nextProps.id) {
        return false;
    }

    const prevData = prevProps.data;
    const nextData = nextProps.data;

    if (prevData === nextData) return true;
    if (!prevData || !nextData) return false;

    // Text content
    if (prevData.description !== nextData.description) {
        return false;
    }

    // Font
    if (prevData.fontSize !== nextData.fontSize) {
        return false;
    }

    // Padding (Shallow Check)
    const p1 = prevData.padding || {};
    const p2 = nextData.padding || {};
    if (p1.horizontal !== p2.horizontal || p1.vertical !== p2.vertical) {
        return false;
    }

    // Theme tokens mapping
    if (
        prevData.domain !== nextData.domain ||
        prevData.domainClass !== nextData.domainClass
    ) {
        return false;
    }

    // customStyle (Shallow Check)
    const s1 = prevData.customStyle;
    const s2 = nextData.customStyle;
    if (s1 !== s2) {
        if (!s1 || !s2) return false;
        const k1 = Object.keys(s1);
        const k2 = Object.keys(s2);
        if (k1.length !== k2.length) return false;
        for (const key of k1) {
            if (s1[key] !== s2[key]) return false;
        }
    }

    return true;
};

export default React.memo(CustomNode, arePropsEqual);
