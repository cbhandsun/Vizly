import { forwardRef } from 'react';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  CoreFlowchartEditor,
  type CoreFlowchartEditorProps,
} from '@vizly/core/react';
import { configureCoreI18n } from '@vizly/core/i18n';
import type { VizlyEditorHandle } from '@vizly/contracts';
import '@vizly/core/style.css';

export type {
  VizlyDocument,
  VizlyDocumentEdge,
  VizlyDocumentNode,
  VizlyDocumentParseResult,
  VizlyEditorCommand,
  VizlyEditorEvent,
  VizlyEditorHandle,
  VizlyEditorHostServices,
} from '@vizly/contracts';

export interface VizlyEditorProps extends CoreFlowchartEditorProps {
  i18n: i18n;
}

export const VizlyEditor = forwardRef<VizlyEditorHandle, VizlyEditorProps>(({
  i18n: i18nInstance,
  ...props
}, ref) => {
  configureCoreI18n(i18nInstance);
  return (
    <I18nextProvider i18n={i18nInstance}>
      <CoreFlowchartEditor {...props} ref={ref} />
    </I18nextProvider>
  );
});

VizlyEditor.displayName = 'VizlyEditor';
