type Point = Readonly<{ x: number; y: number }>;

const pathSignature = (path: readonly Point[]): string => path
  .map(point => `${point.x}:${point.y}`)
  .join('|');

export const uniqueBusinessNodeClearancePaths = <T extends Point[]>(
  paths: readonly T[],
): T[] => {
  const seen = new Set<string>();
  return paths.filter(path => {
    const signature = pathSignature(path);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

export const createBusinessNodeClearanceCandidateCollection = <T extends Point[]>() => {
  const paths: T[] = [];
  const seen = new Set<string>();
  let generatedCandidateCount = 0;
  const add = (path: T): void => {
    generatedCandidateCount += 1;
    const signature = pathSignature(path);
    if (seen.has(signature)) return;
    seen.add(signature);
    paths.push(path);
  };
  return {
    add,
    addAll: (candidates: readonly T[]): void => candidates.forEach(add),
    read: () => ({ generatedCandidateCount, paths }),
  };
};
