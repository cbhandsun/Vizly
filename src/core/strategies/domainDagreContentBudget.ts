/** A parent's already occupied envelope, not a requested node resize. The
 * objective is the dimension which can shrink without lengthening that parent.
 */
export type DomainDagreContentBudget = Readonly<{
  maxWidth: number;
  maxHeight: number;
  objective: 'width' | 'height';
}>;

export const validDomainDagreContentBudget = (
  budget: DomainDagreContentBudget | undefined,
): budget is DomainDagreContentBudget => Boolean(budget
  && (budget.objective === 'width' || budget.objective === 'height')
  && [budget.maxWidth, budget.maxHeight].every(value => Number.isFinite(value) && value > 0 && value <= 1_000_000));
