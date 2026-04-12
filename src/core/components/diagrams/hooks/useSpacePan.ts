import { useState, useEffect, useCallback } from 'react';

/**
 * Space 键画布平移 Hook
 * 按住 Space 键时临时切换到画布平移模式（Pan Mode）
 */
export const useSpacePan = () => {
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            const target = event.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
                return;
            }

            // Activate pan mode when Space is pressed
            if (event.code === 'Space' && !isSpacePressed) {
                event.preventDefault();
                setIsSpacePressed(true);
                document.body.style.cursor = 'grab';
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            // Deactivate pan mode when Space is released
            if (event.code === 'Space') {
                event.preventDefault();
                setIsSpacePressed(false);
                document.body.style.cursor = '';
            }
        };

        // Handle window blur (if user switches tabs while holding Space)
        const handleBlur = () => {
            setIsSpacePressed(false);
            document.body.style.cursor = '';
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            document.body.style.cursor = '';
        };
    }, [isSpacePressed]);

    return { isSpacePressed };
};
