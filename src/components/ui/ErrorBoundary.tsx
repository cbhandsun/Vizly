import React, { ReactNode, ErrorInfo } from 'react';
import { Button, Result } from 'antd';
import { logUiBoundaryError } from '@vizly/core/logging';

interface ErrorBoundaryState {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    title: string;
    subTitle: string;
    retryLabel?: string;
    resetKey?: string;
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

    public componentDidUpdate(previous: ErrorBoundaryProps) {
        if (previous.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <Result
                        status="error"
                        title={this.props.title}
                        subTitle={this.props.subTitle}
                        extra={this.props.retryLabel ? (
                            <Button type="primary" onClick={() => this.setState({ hasError: false })}>
                                {this.props.retryLabel}
                            </Button>
                        ) : undefined}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}
