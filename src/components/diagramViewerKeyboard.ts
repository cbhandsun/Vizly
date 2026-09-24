type DiagramViewerKeyboardAction =
  | 'exitFullscreen'
  | 'toggleDebugPanel'
  | 'openCommandPalette'
  | 'openSettings'
  | 'addNode'
  | 'triggerAi'
  | 'smartLayout'
  | 'exportPng'
  | 'triggerTheme'
  | 'exitPresentation';

export const resolveDiagramViewerKeyboardActions = ({
  event,
  isPresentationMode,
  isFullscreenActive,
}: {
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;
  isPresentationMode: boolean;
  isFullscreenActive: boolean;
}): DiagramViewerKeyboardAction[] => {
  const actions: DiagramViewerKeyboardAction[] = [];
  const mod = event.ctrlKey || event.metaKey;

  if (event.key === 'Escape') {
    if (isFullscreenActive) {
      actions.push('exitFullscreen');
    }
    if (isPresentationMode) {
      actions.push('exitPresentation');
    }
  }

  if (import.meta.env.DEV && mod && event.shiftKey && (event.key === 'd' || event.key === 'D')) {
    actions.push('toggleDebugPanel');
  }

  if (mod && (event.key === 'k' || event.key === 'K')) {
    actions.push('openCommandPalette');
  }

  if (mod && event.key === ',') {
    actions.push('openSettings');
  }

  if (event.altKey && (event.key === 'n' || event.key === 'N')) {
    actions.push('addNode');
  }

  if (mod && (event.key === 'j' || event.key === 'J')) {
    actions.push('triggerAi');
  }

  if (mod && event.shiftKey && (event.key === 'l' || event.key === 'L')) {
    actions.push('smartLayout');
  }

  if (mod && event.shiftKey && (event.key === 'e' || event.key === 'E')) {
    actions.push('exportPng');
  }

  if (mod && event.shiftKey && (event.key === 't' || event.key === 'T')) {
    actions.push('triggerTheme');
  }

  return actions;
};

export const createDiagramViewerGlobalKeydownHandler = ({
  isPresentationMode,
  editingEnabled,
  isGlobalShortcutBlocked = () => false,
  isFullscreenActive,
  exitFullscreen,
  onFullscreenExitFailure,
  toggleDebugPanel,
  openCommandPalette,
  openSettings,
  triggerEditorCommand,
  triggerAi,
  triggerTheme,
  exitPresentation,
}: {
  isPresentationMode: boolean;
  editingEnabled: boolean;
  isGlobalShortcutBlocked?: () => boolean;
  isFullscreenActive: () => boolean;
  exitFullscreen: () => void;
  onFullscreenExitFailure: (error: unknown) => void;
  toggleDebugPanel: () => void;
  openCommandPalette: () => void;
  openSettings: () => void;
  triggerEditorCommand: (action: 'add-node' | 'smart-layout' | 'export-png') => void;
  triggerAi: () => void;
  triggerTheme: () => void;
  exitPresentation: () => void;
}) => {
  return (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (isGlobalShortcutBlocked()) {
      return;
    }

    const actions = resolveDiagramViewerKeyboardActions({
      event,
      isPresentationMode,
      isFullscreenActive: isFullscreenActive(),
    });

    for (const action of actions) {
      if (!editingEnabled && (
        action === 'addNode'
        || action === 'triggerAi'
        || action === 'smartLayout'
      )) {
        event.preventDefault();
        continue;
      }
      switch (action) {
        case 'exitFullscreen':
          event.preventDefault();
          try {
            exitFullscreen();
          } catch (error) {
            onFullscreenExitFailure(error);
          }
          break;
        case 'toggleDebugPanel':
          event.preventDefault();
          toggleDebugPanel();
          break;
        case 'openCommandPalette':
          event.preventDefault();
          openCommandPalette();
          break;
        case 'openSettings':
          event.preventDefault();
          openSettings();
          break;
        case 'addNode':
          event.preventDefault();
          triggerEditorCommand('add-node');
          break;
        case 'triggerAi':
          event.preventDefault();
          triggerAi();
          break;
        case 'smartLayout':
          event.preventDefault();
          triggerEditorCommand('smart-layout');
          break;
        case 'exportPng':
          event.preventDefault();
          triggerEditorCommand('export-png');
          break;
        case 'triggerTheme':
          event.preventDefault();
          triggerTheme();
          break;
        case 'exitPresentation':
          exitPresentation();
          break;
      }
    }
  };
};
