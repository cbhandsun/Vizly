import React, { lazy, Suspense, useState, type ComponentType, type ErrorInfo } from 'react';
import Modal from 'antd/es/modal';
import { useTranslation } from 'react-i18next';
import { logUiBoundaryError } from '@vizly/core/logging';
import { isCommandPalettePreloadFailure, loadWithLocalPreloadRecovery } from '../../main/localPreloadRecovery';

type CommandPaletteProps = React.ComponentProps<typeof import('@vizly/core/editor-ui').CommandPalette>;
type CommandPaletteModule = { CommandPalette: ComponentType<CommandPaletteProps> };

class CommandPaletteLoadBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) { logUiBoundaryError(error, info); }

  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** A fresh lazy identity per opening prevents a rejected React loader persisting after dismissal. */
export function createDeferredCommandPalette(loadModule: () => Promise<CommandPaletteModule>) {
  return function DeferredCommandPalette(props: CommandPaletteProps) {
    const { t } = useTranslation();
    const [Palette] = useState(() => lazy(async () => ({ default: (await loadModule()).CommandPalette })));
    const dismiss = props.onDismiss ?? props.onClose;
    if (!props.open) return null;
    const frame = (failed: boolean) => <Modal
      open
      title={t('designer.commandPalette.searchAria')}
      zIndex={2200}
      getContainer={props.getContainer}
      onCancel={dismiss}
      onOk={dismiss}
      okText={t('common.close')}
      cancelButtonProps={{ style: { display: 'none' } }}
      focusTriggerAfterClose={false}
    >
      <p role={failed ? 'alert' : 'status'}>{failed
        ? t('designer.commandPalette.loadFailed')
        : t('common.loading')}</p>
    </Modal>;
    return <CommandPaletteLoadBoundary fallback={frame(true)}>
      <Suspense fallback={frame(false)}><Palette {...props} /></Suspense>
    </CommandPaletteLoadBoundary>;
  };
}

export const DeferredCommandPalette = createDeferredCommandPalette(() => loadWithLocalPreloadRecovery(
  () => import('@vizly/core/editor-ui'),
  payload => isCommandPalettePreloadFailure(payload, window.location.origin),
));
