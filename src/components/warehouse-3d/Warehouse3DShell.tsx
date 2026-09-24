import type { ReactNode } from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Warehouse3DShellProps {
    children?: ReactNode;
    controls?: ReactNode;
    loading: boolean;
}

const Warehouse3DShell = ({ children, controls, loading }: Warehouse3DShellProps) => {
    const { t } = useTranslation();

    return (
        <div
            className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans"
            data-smoke-ready="warehouse-3d"
        >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900/80 to-slate-900" />

            {children}

            <div className="absolute left-4 top-4 z-10 pointer-events-auto">
                <div className="w-[calc(100vw-32px)] max-w-[360px] rounded-lg border border-white/10 bg-slate-900/80 p-3 px-4 shadow-sm backdrop-blur-md">
                    <a
                        className="mb-2 inline-flex items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-200 no-underline transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                        href="#/manage"
                        style={{ minHeight: '44px' }}
                    >
                        <ArrowLeftOutlined aria-hidden="true" />
                        {t('diagram.warehouse3d.returnToWorkspace')}
                    </a>
                    <h1 className="text-[15px] font-semibold text-white m-0 tracking-tight leading-none">
                        {t('diagram.warehouse3d.title')}
                    </h1>
                    <p className="mb-0 mt-1 break-words text-[11px] font-medium uppercase leading-4 tracking-wider text-slate-400">
                        {t('diagram.warehouse3d.subtitle')}
                    </p>
                </div>
            </div>

            <div
                className="pointer-events-none absolute right-4 top-4 z-10 hidden max-w-[280px] rounded-lg border border-white/10 bg-slate-900/80 px-4 py-3 text-right text-xs leading-5 text-slate-300 shadow-sm backdrop-blur-md sm:block"
                id="warehouse-3d-keyboard-help"
            >
                {t('diagram.warehouse3d.instructions')}
            </div>

            <span className="sr-only" id="warehouse-3d-scene-help">
                {t('diagram.warehouse3d.instructions')}
            </span>

            {controls}

            {loading ? (
                <div
                    aria-live="polite"
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/90 text-white backdrop-blur-sm"
                    role="status"
                >
                    <div aria-hidden="true" className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
                    <div className="text-lg font-medium tracking-wide">
                        {t('diagram.warehouse3d.loading')}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default Warehouse3DShell;
