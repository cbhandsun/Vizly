// 简单的 Web Worker 适配空实现（函数级注释）
// - 某些第三方库在构建时将 'web-worker' 依赖外部化，导致浏览器无法解析模块名
// - 若运行时未真正使用该依赖，此空实现可避免报错；若需要真实 Worker，请在使用处替换为实际实现
export default undefined as unknown as Worker;
