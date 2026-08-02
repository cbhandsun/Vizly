import type { ReactNode } from 'react';

interface Warehouse3DShellProps {
    children?: ReactNode;
    controls?: ReactNode;
    loading: boolean;
}

const Warehouse3DShell = ({ children, controls, loading }: Warehouse3DShellProps) => (
    <div
        className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans"
        data-smoke-ready="warehouse-3d"
    >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900/80 to-slate-900" />

        {children}

        <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 p-3 px-4 rounded-lg shadow-sm">
                <h1 className="text-[15px] font-semibold text-white m-0 tracking-tight leading-none">
                    Large Retail Logistics Center
                </h1>
                <p className="text-slate-400 font-medium mt-1 mb-0 text-[11px] uppercase tracking-wider">
                    Interactive 3D Simulation View
                </p>
            </div>
        </div>

        {controls ? <div className="relative z-20">{controls}</div> : null}

        {loading ? (
            <div
                aria-live="polite"
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/90 text-white backdrop-blur-sm"
                role="status"
            >
                <div aria-hidden="true" className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
                <div className="text-lg font-medium tracking-wide">正在加载 3D 场景…</div>
            </div>
        ) : null}
    </div>
);

export default Warehouse3DShell;
