import { setTimeout as delay } from 'node:timers/promises';

const EXPORT_CAPTURE_LIMIT = 12;
const EXPORT_WAIT_MS = 90_000;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const EXPORT_FORMATS = Object.freeze(['png', 'svg', 'pdf']);

export const DISPLAY_ROUTING_EXPORT_CAPTURE_SCRIPT = String.raw`(() => {
  if (window.__vizlyRoutingExportCaptureInstalled === true) return;
  window.__vizlyRoutingExportCaptureInstalled = true;
  const captures = [];
  const blobsByUrl = new Map();
  const captureLimit = ${EXPORT_CAPTURE_LIMIT};
  const maxSvgChars = 8 * 1024 * 1024;

  Object.defineProperty(window, '__vizlyRoutingExportCaptures', {
    configurable: false,
    enumerable: false,
    get: () => captures.map(capture => ({ ...capture })),
  });

  const pushCapture = capture => {
    captures.push(capture);
    if (captures.length > captureLimit) captures.splice(0, captures.length - captureLimit);
  };

  const extensionFrom = (download, mimeType) => {
    const match = String(download || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    const extension = match?.[1];
    if (extension === 'svg' || extension === 'png' || extension === 'pdf') return extension;
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('svg')) return 'svg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('pdf')) return 'pdf';
    return 'unknown';
  };

  const bytesToHex = bytes => [...bytes]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

  const fingerprint = values => {
    let hash = 2166136261;
    const input = values.join('\u001f');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const auditSvg = markup => {
    if (typeof markup !== 'string' || markup.length === 0 || markup.length > maxSvgChars) {
      throw new Error('svg-size');
    }
    const documentNode = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = documentNode.documentElement;
    if (root?.localName !== 'svg' || documentNode.querySelector('parsererror')) {
      throw new Error('svg-parse');
    }
    const edgeGroups = [...root.querySelectorAll('.vizly-export-edges > g[data-edge-id]')];
    const logicalIds = edgeGroups.map(group => String(group.getAttribute('data-edge-id') || '')
      .split('::')[0]);
    const semanticPaths = edgeGroups.flatMap(group => [...group.querySelectorAll(':scope > path')]
      .filter(path => !path.classList.contains('vizly-export-edge-contrast-underlay')));
    const pathData = semanticPaths.map(path => path.getAttribute('d') || '');
    const markerDefinitions = [...root.querySelectorAll('defs marker[id]')];
    const markerDefinitionIds = markerDefinitions.map(marker => marker.getAttribute('id') || '');
    const markerReferences = [];
    const markerRoles = new Map();
    for (const group of edgeGroups) {
      const logicalId = String(group.getAttribute('data-edge-id') || '').split('::')[0];
      for (const path of group.querySelectorAll(':scope > path')) {
        for (const role of ['marker-start', 'marker-end']) {
          const value = path.getAttribute(role);
          if (!value) continue;
          const reference = /^url\(#([^)]+)\)$/.exec(value)?.[1] || '';
          markerReferences.push(reference);
          const key = logicalId + ':' + role;
          markerRoles.set(key, (markerRoles.get(key) || 0) + 1);
        }
      }
    }
    const markerCarriers = edgeGroups.filter(group => (
      group.getAttribute('data-shared-trunk-marker-paint') === 'owner-fallback'
    ));
    const allElements = [...root.querySelectorAll('*')];
    const inlineEventCount = allElements.reduce((total, element) => (
      total + [...element.attributes].filter(attribute => /^on/i.test(attribute.name)).length
    ), 0);
    const externalHrefCount = allElements.reduce((total, element) => {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href');
      return total + (href && !href.startsWith('#') ? 1 : 0);
    }, 0);
    return {
      edgeGroupCount: edgeGroups.length,
      logicalEdgeCount: new Set(logicalIds.filter(Boolean)).size,
      semanticPathCount: semanticPaths.length,
      pathDataTotalChars: pathData.reduce((total, value) => total + value.length, 0),
      pathFingerprint: fingerprint(pathData),
      nonFinitePathCount: pathData.filter(value => (
        !value || /(?:nan|infinity|undefined|null)/i.test(value)
      )).length,
      markerDefinitionCount: markerDefinitions.length,
      duplicateMarkerDefinitionCount: markerDefinitionIds.length
        - new Set(markerDefinitionIds).size,
      markerReferenceCount: markerReferences.length,
      unresolvedMarkerReferenceCount: markerReferences.filter(reference => (
        !reference || !markerDefinitionIds.includes(reference)
      )).length,
      duplicateMarkerRoleCount: [...markerRoles.values()].filter(count => count > 1).length,
      markerCarrierCount: markerCarriers.length,
      markerCarrierWithVisibleStrokeCount: markerCarriers.filter(group => {
        const path = group.querySelector(':scope > path');
        const stroke = String(path?.getAttribute('stroke') || '').trim().toLowerCase();
        return stroke !== 'transparent' && stroke !== 'none';
      }).length,
      interactionPathCount: root.querySelectorAll('.react-flow__edge-interaction').length,
      nodeGroupCount: root.querySelectorAll('.vizly-export-nodes > g[data-node-id]').length,
      unsafeElementCount: root.querySelectorAll('script, iframe, object, embed, link, meta').length,
      inlineEventCount,
      externalHrefCount,
    };
  };

  const analyzeBlob = async (blob, download) => {
    const format = extensionFrom(download, blob?.type);
    const byteLength = Number(blob?.size) || 0;
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const capture = {
      format,
      mimeType: String(blob?.type || '').toLowerCase(),
      byteLength,
      headerHex: bytesToHex(header),
    };
    if (format === 'svg') capture.svg = auditSvg(await blob.text());
    pushCapture(capture);
  };

  const analyzeDataUrl = async (href, download) => {
    const separator = href.indexOf(',');
    if (separator <= 0) throw new Error('data-url');
    const prefix = href.slice(0, separator).toLowerCase();
    const payload = href.slice(separator + 1);
    const format = extensionFrom(download, prefix);
    if (format === 'svg') {
      const markup = prefix.includes(';base64')
        ? atob(payload)
        : decodeURIComponent(payload);
      pushCapture({
        format,
        mimeType: 'image/svg+xml',
        byteLength: new TextEncoder().encode(markup).byteLength,
        headerHex: 'svg',
        svg: auditSvg(markup),
      });
      return;
    }
    if (format === 'png') {
      const normalized = payload.replace(/\s+/g, '');
      const header = Uint8Array.from(atob(normalized.slice(0, 24)), char => char.charCodeAt(0));
      const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
      pushCapture({
        format,
        mimeType: 'image/png',
        byteLength: Math.max(0, Math.floor(normalized.length * 3 / 4) - padding),
        headerHex: bytesToHex(header.slice(0, 12)),
      });
      return;
    }
    throw new Error('unsupported-data-url');
  };

  const queueCapture = (href, download) => {
    Promise.resolve().then(async () => {
      if (href.startsWith('blob:')) {
        const blob = blobsByUrl.get(href);
        if (!blob) throw new Error('blob-miss');
        await analyzeBlob(blob, download);
        return;
      }
      if (href.startsWith('data:')) await analyzeDataUrl(href, download);
    }).catch(() => pushCapture({
      format: extensionFrom(download, ''),
      mimeType: '',
      byteLength: 0,
      headerHex: '',
      error: 'capture-analysis-failed',
    }));
  };

  const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    const url = originalCreateObjectUrl(blob);
    if (blob instanceof Blob) blobsByUrl.set(url, blob);
    return url;
  };
  const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = url => {
    blobsByUrl.delete(String(url));
    return originalRevokeObjectUrl(url);
  };

  const isDownloadAnchor = anchor => {
    const href = String(anchor?.href || '');
    return Boolean(anchor?.download) && (href.startsWith('blob:') || href.startsWith('data:'));
  };
  const captureAnchor = anchor => {
    if (!isDownloadAnchor(anchor)) return false;
    queueCapture(String(anchor.href), String(anchor.download));
    return true;
  };
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function routingExportCaptureClick() {
    if (captureAnchor(this)) return;
    return originalAnchorClick.call(this);
  };
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (!captureAnchor(anchor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();`;

const waitForValue = async (session, expression, timeoutMs = EXPORT_WAIT_MS) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  return null;
};

const readRoutingState = session => session.evaluate(`(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return {
    stage: routing.stage,
    outputRouteSignature: routing.outputRouteSignature,
    workerStartCount: routing.workerStartCount,
    workerAbortCount: routing.workerAbortCount,
  };
})()`);

const assertRoutingState = (state, expected) => {
  if (
    state?.stage === 'final-applied'
    && state.outputRouteSignature === expected.outputRouteSignature
    && state.workerStartCount === expected.workerStartCount
    && state.workerAbortCount === expected.workerAbortCount
  ) return state;
  throw new Error(`Display-routing export changed committed routing state: ${JSON.stringify({
    signatureMatches: state?.outputRouteSignature === expected.outputRouteSignature,
    stage: state?.stage ?? null,
    workerStartCount: state?.workerStartCount ?? null,
    workerAbortCount: state?.workerAbortCount ?? null,
  })}`);
};

export const assertDisplayRoutingExportCapture = ({
  capture,
  format,
  expectedLogicalEdgeCount,
}) => {
  const commonValid = capture
    && capture.error == null
    && capture.format === format
    && Number.isFinite(capture.byteLength)
    && capture.byteLength >= 128
    && capture.byteLength <= MAX_EXPORT_BYTES;
  const formatValid = format === 'png'
    ? capture?.mimeType === 'image/png' && capture.headerHex?.startsWith('89504e470d0a1a0a')
    : format === 'pdf'
      ? capture?.mimeType === 'application/pdf' && capture.headerHex?.startsWith('255044462d')
      : capture?.mimeType === 'image/svg+xml'
        && capture.headerHex === 'svg'
        && capture.svg?.logicalEdgeCount === expectedLogicalEdgeCount
        && capture.svg?.edgeGroupCount >= expectedLogicalEdgeCount
        && capture.svg?.semanticPathCount === capture.svg?.edgeGroupCount
        && capture.svg?.pathDataTotalChars > 0
        && /^[0-9a-f]{8}$/.test(capture.svg?.pathFingerprint ?? '')
        && capture.svg?.nonFinitePathCount === 0
        && capture.svg?.markerDefinitionCount > 0
        && capture.svg?.duplicateMarkerDefinitionCount === 0
        && capture.svg?.markerReferenceCount > 0
        && capture.svg?.unresolvedMarkerReferenceCount === 0
        && capture.svg?.duplicateMarkerRoleCount === 0
        && capture.svg?.markerCarrierWithVisibleStrokeCount === 0
        && capture.svg?.interactionPathCount === 0
        && capture.svg?.nodeGroupCount > 0
        && capture.svg?.unsafeElementCount === 0
        && capture.svg?.inlineEventCount === 0
        && capture.svg?.externalHrefCount === 0;
  if (commonValid && formatValid) return capture;
  throw new Error(`Display-routing ${format} export audit failed: ${JSON.stringify({
    format: capture?.format ?? null,
    mimeType: capture?.mimeType ?? null,
    byteLength: capture?.byteLength ?? null,
    headerHex: capture?.headerHex ?? null,
    error: capture?.error ?? null,
    svg: capture?.svg ?? null,
  })}`);
};

export const assertDisplayRoutingExportAvailability = ({
  format,
  status,
  requireLicensedExports,
}) => {
  const validStatus = status === 'downloaded'
    || status === 'preview-entitlement-gated'
    || status === 'entitlement-gated';
  if (validStatus && (!requireLicensedExports || status === 'downloaded')) return status;
  throw new Error(`${format} export requires a licensed browser verification profile`);
};

export const formatDisplayRoutingExportMatrix = matrix => {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  return `exports: ${matrix.map(item => (
    item.byteLength
      ? `${item.format}/${item.status}/${Math.ceil(item.byteLength / 1024)}KiB`
      : `${item.format}/${item.status}`
  )).join(', ')}.`;
};

const openAdvancedExport = async session => {
  const opened = await session.evaluate(`(() => {
    const trigger = document.querySelector('[data-advanced-export-focus-return="true"]');
    if (!(trigger instanceof HTMLElement)) return false;
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    return true;
  })()`);
  if (!opened) throw new Error('Advanced export trigger was not available');
  const menuClicked = await waitForValue(session, `(() => {
    const items = [...document.querySelectorAll('.flowchart-more-menu [role="menuitem"]')];
    const item = items.find(candidate => String(candidate.getAttribute('data-menu-id') || '')
      .endsWith('-export'));
    if (!(item instanceof HTMLElement) || item.getBoundingClientRect().width <= 0) return false;
    item.click();
    return true;
  })()`, 10_000);
  if (!menuClicked) {
    throw new Error('Advanced export menu item was not available');
  }
  const modalReady = await waitForValue(
    session,
    `Boolean(document.querySelector('.advanced-export-modal .ant-modal-container'))`,
    10_000,
  );
  if (!modalReady) {
    const diagnostics = await session.evaluate(`(() => {
      const trigger = document.querySelector('[data-advanced-export-focus-return="true"]');
      const items = [...document.querySelectorAll('.flowchart-more-menu [role="menuitem"]')];
      const exportItem = items.find(candidate => String(candidate.getAttribute('data-menu-id') || '')
        .endsWith('-export'));
      return {
        triggerCount: document.querySelectorAll(
          '[data-advanced-export-focus-return="true"]'
        ).length,
        triggerExpanded: trigger?.getAttribute('aria-expanded') || null,
        menuCount: document.querySelectorAll('.flowchart-more-menu').length,
        visibleMenuCount: [...document.querySelectorAll('.flowchart-more-menu')]
          .filter(menu => menu.getBoundingClientRect().width > 0).length,
        exportItemCount: items.filter(candidate => String(
          candidate.getAttribute('data-menu-id') || ''
        ).endsWith('-export')).length,
        exportItemDisabled: exportItem?.getAttribute('aria-disabled') || null,
        modalContainerCount: document.querySelectorAll('.ant-modal-container').length,
        exportModalRootCount: document.querySelectorAll('.advanced-export-modal').length,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
      };
    })()`);
    throw new Error(`Advanced export modal did not open: ${JSON.stringify(diagnostics)}`);
  }
};

const captureSvgPreview = async session => {
  const captureCount = await session.evaluate(
    `(window.__vizlyRoutingExportCaptures || []).length`,
  );
  const queued = await waitForValue(session, `(() => {
    const image = document.querySelector('[data-testid="svg-export-preview"] img');
    const href = image instanceof HTMLImageElement ? String(image.src || '') : '';
    if (!href.startsWith('data:image/svg+xml')) return false;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'routing-export-preview.svg';
    anchor.click();
    return true;
  })()`, 10_000);
  if (!queued) throw new Error('SVG export preview was not available');
  const capture = await waitForValue(session, `(() => {
    const captures = window.__vizlyRoutingExportCaptures || [];
    return captures.length > ${JSON.stringify(captureCount)}
      ? captures[captures.length - 1]
      : null;
  })()`, 10_000);
  if (!capture) throw new Error('SVG export preview capture timed out');
  return capture;
};

const closeUpgradeDialog = async session => {
  const closed = await session.evaluate(`(() => {
    const title = document.querySelector('#upgrade-modal-title');
    const container = title?.closest('.ant-modal-container');
    const button = container?.querySelector('.ant-modal-close');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!closed) return false;
  return Boolean(await waitForValue(
    session,
    `!document.querySelector('#upgrade-modal-title')`,
    10_000,
  ));
};

const runExport = async (session, format) => {
  await openAdvancedExport(session);
  const selected = await waitForValue(session, `(() => {
    const input = document.querySelector(
      '.advanced-export-modal input[type="radio"][value=${JSON.stringify(format)}]'
    );
    if (!(input instanceof HTMLInputElement)) return false;
    if (!input.checked) input.click();
    return input.checked;
  })()`);
  if (!selected) throw new Error(`Unable to select ${format} export`);
  const previewCapture = format === 'svg' ? await captureSvgPreview(session) : null;
  const captureCount = await session.evaluate(
    `(window.__vizlyRoutingExportCaptures || []).length`,
  );
  const submitted = await session.evaluate(`(() => {
    const button = document.querySelector(
      '.advanced-export-modal .ant-modal-footer .ant-btn-primary'
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!submitted) throw new Error(`Unable to submit ${format} export`);
  const outcome = await waitForValue(session, `(() => {
    const captures = window.__vizlyRoutingExportCaptures || [];
    if (captures.length > ${JSON.stringify(captureCount)}) {
      return { kind: 'capture', capture: captures[captures.length - 1] };
    }
    if (document.querySelector('#upgrade-modal-title')) return { kind: 'entitlement' };
    if (document.querySelector(
      '.advanced-export-modal [data-testid="advanced-export-recovery"]'
    )) return { kind: 'failure' };
    return null;
  })()`);
  if (!outcome || outcome.kind === 'failure') {
    const diagnostics = await session.evaluate(`(() => {
      const modal = document.querySelector('.advanced-export-modal');
      const checked = modal?.querySelector('input[type="radio"]:checked');
      const submit = modal?.querySelector('.ant-modal-footer .ant-btn-primary');
      return {
        captureInstalled: window.__vizlyRoutingExportCaptureInstalled === true,
        captureCount: (window.__vizlyRoutingExportCaptures || []).length,
        modalOpen: Boolean(modal?.querySelector('.ant-modal-container')),
        checkedFormat: checked?.getAttribute('value') || null,
        submitDisabled: submit instanceof HTMLButtonElement ? submit.disabled : null,
        submitLoading: submit?.classList.contains('ant-btn-loading') ?? null,
        recoveryCount: modal?.querySelectorAll('[data-testid="advanced-export-recovery"]')
          .length ?? 0,
        upgradeDialogCount: document.querySelectorAll('#upgrade-modal-title').length,
        anchorOverrideInstalled: HTMLAnchorElement.prototype.click.name
          === 'routingExportCaptureClick',
      };
    })()`);
    throw new Error(`Failed waiting for ${format} export capture: ${JSON.stringify(
      diagnostics,
    )}`);
  }
  if (outcome.kind === 'entitlement') {
    if (!await closeUpgradeDialog(session)) {
      throw new Error(`Unable to close ${format} entitlement dialog`);
    }
    return {
      capture: previewCapture,
      status: previewCapture ? 'preview-entitlement-gated' : 'entitlement-gated',
    };
  }
  await waitForValue(
    session,
    `!document.querySelector('.advanced-export-modal .ant-modal-container')`,
  );
  return { capture: outcome.capture, status: 'downloaded' };
};

export const verifyDisplayRoutingExportMatrix = async ({
  session,
  expectedSignature,
  expectedWorkerStartCount,
  expectedWorkerAbortCount,
  expectedLogicalEdgeCount,
  requireLicensedExports = false,
}) => {
  const expectedRouting = {
    outputRouteSignature: expectedSignature,
    workerStartCount: expectedWorkerStartCount,
    workerAbortCount: expectedWorkerAbortCount,
  };
  assertRoutingState(await readRoutingState(session), expectedRouting);
  const results = [];
  for (const format of EXPORT_FORMATS) {
    const outcome = await runExport(session, format);
    assertDisplayRoutingExportAvailability({
      format,
      status: outcome.status,
      requireLicensedExports,
    });
    const capture = outcome.capture
      ? assertDisplayRoutingExportCapture({
        capture: outcome.capture,
        format,
        expectedLogicalEdgeCount,
      })
      : null;
    assertRoutingState(await readRoutingState(session), expectedRouting);
    results.push({
      format,
      status: outcome.status,
      mimeType: capture?.mimeType ?? null,
      byteLength: capture?.byteLength ?? null,
      ...(format === 'svg' && capture ? {
        logicalEdgeCount: capture.svg.logicalEdgeCount,
        edgeGroupCount: capture.svg.edgeGroupCount,
        pathFingerprint: capture.svg.pathFingerprint,
      } : {}),
    });
  }
  return results;
};
