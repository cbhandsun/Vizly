export const DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 2,
  maxHitBudget: 3,
  maxQualityEvaluations: 160,
  maxResidualPasses: 1,
};

export const DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 2,
  maxQualityEvaluations: 16,
  maxResidualPasses: 1,
};

export const DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 2,
  maxHitBudget: 6,
  maxQualityEvaluations: 640,
  maxResidualPasses: 2,
  qualityOnly: true,
};

export const DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 1,
  maxQualityEvaluations: 8,
  maxResidualPasses: 1,
  qualityOnly: true,
};
