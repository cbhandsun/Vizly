type ProTimelineCriticalPathAvailability = {
  taskCount: number;
  criticalTaskCount: number;
  cyclicTaskCount: number;
};

export const getProTimelineCriticalPathUnavailableReason = ({
  taskCount,
  criticalTaskCount,
  cyclicTaskCount,
}: ProTimelineCriticalPathAvailability): string | undefined => {
  if (criticalTaskCount > 0) return undefined;
  if (cyclicTaskCount > 0) return '请先解决循环依赖后再查看关键路径';
  if (taskCount === 0) return '请先添加至少一个排期任务';
  return '当前排期没有可计算的关键路径';
};
