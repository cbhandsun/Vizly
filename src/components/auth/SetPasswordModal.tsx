import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';

interface SetPasswordModalProps {
    open: boolean;
    onCancel: () => void;
}

export const SetPasswordModal: React.FC<SetPasswordModalProps> = ({ open, onCancel }) => {
    const { t } = useTranslation();
    const { updatePassword } = useAuth();
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    const handleClose = () => {
        form.resetFields();
        onCancel();
    };

    const onFinish = async (values: any) => {
        if (values.password !== values.confirmPassword) {
            message.error(t('auth.modal.register.passwordMismatch'));
            return;
        }
        setLoading(true);
        const { error } = await updatePassword(values.password);
        setLoading(false);

        if (error) {
            message.error(error.message);
        } else {
            message.success(t('auth.modal.setPasswordSuccess'));
            handleClose();
        }
    };

    return (
        <Modal
            title={t('auth.menu.setPassword')}
            open={open}
            onCancel={handleClose}
            footer={null}
            destroyOnHidden
            width={400}
        >
            <Form 
                form={form} 
                onFinish={onFinish} 
                layout="vertical" 
                autoComplete="off" 
                style={{ marginTop: 24 }}
            >
                <Form.Item
                    name="password"
                    rules={[
                        { required: true, message: t('auth.modal.password.required') },
                        { min: 6, message: t('auth.modal.register.passwordMin') }
                    ]}
                >
                    <Input.Password
                        prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder={t('auth.modal.register.passwordPlaceholder')}
                        size="large"
                    />
                </Form.Item>
                <Form.Item
                    name="confirmPassword"
                    rules={[{ required: true, message: t('auth.modal.register.confirmRequired') }]}
                >
                    <Input.Password
                        prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder={t('auth.modal.register.confirmPlaceholder')}
                        size="large"
                    />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                        {t('common.confirm')}
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    );
};
