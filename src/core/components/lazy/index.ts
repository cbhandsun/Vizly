/**
 * 懒加载组件索引文件
 * 导出所有懒加载组件，方便统一引用
 */

export { LazyMonacoEditor } from './LazyMonacoEditor';
export { LazyMermaidDiagram } from './LazyMermaidDiagram';

// 注意：默认导出需要先导入组件
import { LazyMonacoEditor } from './LazyMonacoEditor';
import { LazyMermaidDiagram } from './LazyMermaidDiagram';

// 默认导出
export default {
    MonacoEditor: LazyMonacoEditor,
    MermaidDiagram: LazyMermaidDiagram,
};
