/**
 * gifshot 模块的最小类型声明
 * 提供 createGIF 的基本入参与返回结构，确保 TypeScript 能正确编译。
 */
declare module 'gifshot' {
  /**
   * 创建 GIF 的配置项
   */
  export interface CreateOptions {
    images?: (string | HTMLImageElement)[];
    interval?: number; // 帧间隔（秒）
    gifWidth?: number;
    gifHeight?: number;
    numWorkers?: number;
    sampleInterval?: number;
    background?: string;
    transparent?: boolean;
    /** 其他可选项 */
    [key: string]: any;
  }

  /**
   * 创建 GIF 的结果
   */
  export interface CreateResult {
    error: boolean;
    errorCode?: string;
    errorMsg?: string;
    image?: string; // dataURL (base64) 形式的 GIF
  }

  /**
   * 从图片数组创建 GIF
   * @param options - 创建配置
   * @param cb - 回调函数，返回结果对象
   */
  export function createGIF(options: CreateOptions, cb: (obj: CreateResult) => void): void;
}
