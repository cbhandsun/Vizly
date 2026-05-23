/**
 * 确定性的伪随机数生成器 (PRNG)
 * 目的：用于解决 React 19 渲染时调用 Math.random() 导致的不纯组件警告。
 * 输入相同的 seed（种子），将产生完全相同且不可预测的数字序列。
 */

/**
 * 简单的基于 Sin 的哈希随机函数，常用于 shader 计算
 * @param seed 数值种子
 * @returns 0 到 1 之间的确定性浮点数
 */
export function hashRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * 创建一个带状态的确定性随机数发生器 (线性同余生成器 LCG)
 * @param seed 初始随机种子
 */
export function createPRNG(seed: number) {
    let currentSeed = seed;
    
    return {
        /**
         * 获取下一个 [0, 1) 范围内的随机数
         */
        next: (): number => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        },
        
        /**
         * 获取 [min, max) 范围内的随机数
         */
        range: (min: number, max: number): number => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            const rnd = currentSeed / 233280;
            return min + rnd * (max - min);
        }
    };
}
