import React, { type ErrorInfo, type ReactNode } from 'react';

interface Warehouse3DErrorBoundaryProps {
    children: ReactNode;
    onRetry: () => void;
}

interface Warehouse3DErrorBoundaryState {
    hasError: boolean;
}

export class Warehouse3DErrorBoundary extends React.Component<
    Warehouse3DErrorBoundaryProps,
    Warehouse3DErrorBoundaryState
> {
    state: Warehouse3DErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): Warehouse3DErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(_error: Error, _info: ErrorInfo): void {
        // The fallback is intentionally user-visible. Avoid logging scene or browser details.
    }

    private handleRetry = (): void => {
        this.setState({ hasError: false });
        this.props.onRetry();
    };

    render(): ReactNode {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 px-6" role="alert">
                <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 text-center text-white shadow-2xl">
                    <h2 className="m-0 text-xl font-semibold">3D 场景加载失败</h2>
                    <p className="mb-5 mt-2 text-sm leading-6 text-slate-300">
                        场景资源暂时无法完成初始化。你可以重试，或返回管理页继续使用其他功能。
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            type="button"
                            className="min-h-11 rounded-lg border-none bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
                            onClick={this.handleRetry}
                        >
                            重试加载
                        </button>
                        <a
                            href="#/manage"
                            className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-5 py-2 text-sm font-medium text-slate-200 no-underline hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
                        >
                            返回管理页
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
