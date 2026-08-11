export type CommonPropertyValue<T> =
    | { kind: 'empty' }
    | { kind: 'mixed' }
    | { kind: 'common'; value: T };

export const resolveCommonPropertyValue = <TItem, TValue>(
    items: TItem[],
    getter: (item: TItem) => TValue,
): CommonPropertyValue<TValue> => {
    if (items.length === 0) return { kind: 'empty' };

    const firstValue = getter(items[0]);
    const hasMixedValues = items.some(item => !Object.is(getter(item), firstValue));

    return hasMixedValues
        ? { kind: 'mixed' }
        : { kind: 'common', value: firstValue };
};
