import React, { ReactNode, ErrorInfo } from 'react';
import { Result } from 'antd';
import { logUiBoundaryError } from '@/core/utils/errorBoundaryLogging';

interface ErrorBoundaryState {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    title: string;
    subTitle: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false
    };

    public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logUiBoundaryError(error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <Result
                        status="error"
                        title={this.props.title}
                        subTitle={this.props.subTitle}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}
