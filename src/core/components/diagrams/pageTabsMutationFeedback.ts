export type PageTabsMutation = 'create' | 'duplicate' | 'move' | 'delete';

const FAILURE_KEYS: Record<PageTabsMutation, string> = {
    create: 'designer.pages.createFailed',
    duplicate: 'designer.pages.duplicateFailed',
    move: 'designer.pages.moveFailed',
    delete: 'designer.pages.deleteFailed',
};

const FAILURE_DEFAULTS: Record<PageTabsMutation, string> = {
    create: '无法新建页面，请重试',
    duplicate: '无法复制页面“{{name}}”，请重试',
    move: '无法移动页面“{{name}}”，请重试',
    delete: '无法删除页面“{{name}}”，请重试',
};

export const getPageTabsMutationFailure = (
    mutation: PageTabsMutation,
): { key: string; defaultValue: string } => ({
    key: FAILURE_KEYS[mutation],
    defaultValue: FAILURE_DEFAULTS[mutation],
});
