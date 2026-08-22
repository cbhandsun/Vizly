import React from 'react';
import type { TFunction } from 'i18next';

import { appModal } from '@/core/utils/antdStaticBridge';
import { LocalWorkspaceManagerContent } from './LocalWorkspaceManager';

export const openLocalWorkspaceManager = (t: TFunction): void => {
  appModal.info({
    title: t('diagramViewer.switcher.localManager.title'),
    content: <LocalWorkspaceManagerContent t={t} />,
    icon: null,
    width: 640,
    okText: t('common.close'),
    maskClosable: false,
  });
};
