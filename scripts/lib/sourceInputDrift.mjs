/** Compare both inventories so added files cannot inherit an older green receipt. */
export const sourceInputDrift = (before, current) => [...new Set([
  ...Object.keys(before), ...Object.keys(current),
])].filter(path => before[path] !== current[path]).sort();
