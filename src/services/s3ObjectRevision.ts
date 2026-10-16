/** Strong, bounded, single ETag. Preserve bytes: an ETag is not a timestamp or checksum. */
export const parseS3ObjectRevision = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !/^"[\x21\x23-\x7e]{1,512}"$/.test(value)
        || /[\\,*]/.test(value)) return undefined;
    return value;
};

export class S3ObjectRevisionError extends Error {
    constructor(operation: 'load' | 'save') {
        super(operation === 'load'
            ? 'S3 未返回有效对象版本，请检查 CORS 是否暴露 ETag 后重新打开图表'
            : 'S3 已响应保存但未返回有效对象版本，请保留本地编辑并重新打开确认保存结果；检查 CORS 是否暴露 ETag');
        this.name = 'S3ObjectRevisionError';
    }
}

export class S3ConditionalWriteConflictError extends Error {
    constructor(readonly status: 409 | 412) {
        super('S3 图表已被修改或目标已存在，本地编辑已保留；请重新打开图表或另存为副本');
        this.name = 'S3ConditionalWriteConflictError';
    }
}

export const requireS3ObjectRevision = (value: unknown, operation: 'load' | 'save'): string => {
    const revision = parseS3ObjectRevision(value);
    if (!revision) throw new S3ObjectRevisionError(operation);
    return revision;
};

export type S3WriteCondition = { ifMatch: string; ifNoneMatch?: never }
    | { ifMatch?: never; ifNoneMatch: '*' };

export const s3WriteConditionHeaders = (condition: unknown): Record<string, string> => {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)
        || Object.keys(condition).length !== 1) throw new Error('Invalid S3 conditional write policy');
    const policy = condition as Record<string, unknown>;
    if (Object.hasOwn(policy, 'ifMatch')) {
        const revision = parseS3ObjectRevision(policy.ifMatch);
        if (!revision) throw new Error('Invalid S3 conditional write revision');
        return { 'if-match': revision };
    }
    if (Object.hasOwn(policy, 'ifNoneMatch') && policy.ifNoneMatch === '*') return { 'if-none-match': '*' };
    throw new Error('Invalid S3 conditional write policy');
};
