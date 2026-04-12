import React, { ReactNode, ErrorInfo } from 'react';
import { Result } from 'antd';

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
        if (process.env.NODE_ENV === 'development') {
            console.error("Uncaught error:", error, errorInfo);
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
                    />
                </div>
            );
        }

        return this.props.children;
    }
}
