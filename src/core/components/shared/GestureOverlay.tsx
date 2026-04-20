import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaCompress, FaExpand } from 'react-icons/fa';

interface GestureOverlayProps {
    zoom: number;
    visible: boolean;
}

/**
 * GAP-11 Phase 3: Gesture Overlay
 * 在移动端手势缩放时显示实时的缩放数值提示。
 */
export const GestureOverlay: React.FC<GestureOverlayProps> = ({ zoom, visible }) => {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    style={{
                        position: 'absolute',
                        top: 80, // 避开顶部控制岛
                        left: '50%',
                        x: '-50%',
                        zIndex: 2000,
                        pointerEvents: 'none',
                        background: 'rgba(255, 255, 255, 0.75)',
                        backdropFilter: 'blur(12px) saturate(180%)',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: '#6366f1',
                        fontWeight: 600,
                        fontSize: '14px'
                    }}
                >
                    {zoom > 100 ? <FaExpand /> : <FaCompress />}
                    <span>缩放: {zoom}%</span>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
