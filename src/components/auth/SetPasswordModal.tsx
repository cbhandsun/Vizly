import React, { useLayoutEffect } from 'react';
import { Alert, Modal, Form, Input, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { AUTH_PASSWORD_MAX_LENGTH, useAuthOperation } from './useAuthOperation';
import './SetPasswordModal.css';

interface SetPasswordModalProps {
    open: boolean;
    onCancel: () => void;
}

interface SetPasswordFormValues {
    password: string;
    confirmPassword: string;
}

export const SetPasswordModal: React.FC<SetPasswordModalProps> = ({ open, onCancel }) => {
    const { t } = useTranslation();
    const { updatePassword } = useAuth();
    const [form] = Form.useForm();
    const operation = useAuthOperation(open);
    const { invalidate: invalidateOperation } = operation;

    useLayoutEffect(() => {
        if (!open) {
            form.resetFields();
            invalidateOperation();
        }
    }, [form, invalidateOperation, open]);

    const handleClose = () => {
        if (operation.busy) return;
        form.resetFields();
        operation.invalidate();
        onCancel();
    };

    const onFinish = async (values: SetPasswordFormValues) => {
        await operation.run(
            () => updatePassword(values.password),
            {
                onError: (messageKey) => appMessage.error(t(messageKey)),
                onSuccess: () => {
                    appMessage.success(t('auth.modal.setPasswordSuccess'));
                    form.resetFields();
                    onCancel();
                },
            },
        );
    };

    return (
        <Modal
            title={t('auth.menu.setPassword')}
            open={open}
            onCancel={handleClose}
            afterOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    form.resetFields();
                    operation.invalidate();
                }
            }}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            footer={null}
            destroyOnHidden
            width={400}
            closable={!operation.busy}
            keyboard={!operation.busy}
            mask={{ closable: !operation.busy }}
            rootClassName="set-password-modal"
        >
            <Form 
                form={form} 
                onFinish={onFinish} 
                layout="vertical" 
                autoComplete="on"
                style={{ marginTop: 24 }}
            >
                {operation.errorMessageKey ? (
                    <div className="set-password-modal__operation-error" tabIndex={-1}>
                        <Alert
                            type="error"
                            showIcon
                            title={t(operation.errorMessageKey)}
                        />
                    </div>
                ) : null}
                <Form.Item
                    label={t('auth.modal.register.passwordPlaceholder')}
                    name="password"
                    rules={[
                        { required: true, message: t('auth.modal.password.required') },
                        { min: 6, message: t('auth.modal.register.passwordMin') },
                        { max: AUTH_PASSWORD_MAX_LENGTH, message: t('auth.modal.passwordTooLong') },
                    ]}
                >
                    <Input.Password
                        prefix={<LockOutlined className="set-password-modal__field-icon" />}
                        placeholder={t('auth.modal.register.passwordPlaceholder')}
                        size="large"
                        autoComplete="new-password"
                        maxLength={AUTH_PASSWORD_MAX_LENGTH}
                    />
                </Form.Item>
                <Form.Item
                    label={t('auth.modal.register.confirmPlaceholder')}
                    name="confirmPassword"
                    dependencies={['password']}
                    rules={[
                        { required: true, message: t('auth.modal.register.confirmRequired') },
                        ({ getFieldValue }) => ({
                            validator(_, value: string | undefined) {
                                if (!value || getFieldValue('password') === value) return Promise.resolve();
                                return Promise.reject(new Error(t('auth.modal.register.passwordMismatch')));
                            },
                        }),
                    ]}
                >
                    <Input.Password
                        prefix={<LockOutlined className="set-password-modal__field-icon" />}
                        placeholder={t('auth.modal.register.confirmPlaceholder')}
                        size="large"
                        autoComplete="new-password"
                        maxLength={AUTH_PASSWORD_MAX_LENGTH}
                    />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                        type="primary"
                        htmlType="submit"
                        block
                        size="large"
                        loading={operation.busy}
                        disabled={operation.busy}
                    >
                        {t('common.confirm')}
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    );
};
