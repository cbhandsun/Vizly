/**
 * 从 DOM 直接读取 React Flow viewport 的真实 transform 状态
 *
 * 为什么不用 reactFlowInstance.getViewport()？
 * → 初始化后 / fitWidthTop 后 getViewport() 可能返回陈旧值 {0,0,1}，
 *   而 DOM 上实际已经 translate(750,539) scale(0.6) 等。
 *   useDiagramDragDrop.ts L60-64 有明确记录此 bug。
 */
export function readDomViewport(): { x: number; y: number; zoom: number } {
    const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!el) return { x: 0, y: 0, zoom: 1 };
    const t = el.style.transform;
    const tr = t.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/);
    const sc = t.match(/scale\(\s*([-\d.]+)\s*\)/);
    return {
        x: tr ? parseFloat(tr[1]) : 0,
        y: tr ? parseFloat(tr[2]) : 0,
        zoom: sc ? parseFloat(sc[1]) : 1,
    };
}
