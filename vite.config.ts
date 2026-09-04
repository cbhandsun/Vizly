/// <reference types="vitest" />
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'path'
import { realpathSync } from 'fs'
import { fileURLToPath } from 'url'
import { jspdfRasterOnlyPlugin } from './vite-plugins/jspdfRasterOnly'
import { sharedModuleWorkersPlugin } from './vite-plugins/sharedModuleWorkers'
import { devCspPlugin } from './vite-plugins/devCsp'
import { elkWorkerAssetPlugin } from './vite-plugins/elkWorkerAsset'
import { pdfFontAssetPlugin } from './vite-plugins/pdfFontAsset'
import {
  matchesAppSafeLoggingModule,
  matchesDisplayRoutingNeutralModule,
  matchesFlowchartDesignerStartupModule,
  matchesFlowchartDesignerMicroModule,
  matchesFlowchartRuntimeModule,
  productionChunkFileNames,
} from './vite-plugins/buildChunkGroups'
import { createDisplayRoutingChunkClassifier } from './vite-plugins/displayRoutingChunkClassifier'
import { minifyLocaleAssetsPlugin } from './vite-plugins/minifyLocaleAssets'
import coverageThresholds from './scripts/coverage-thresholds.json'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const projectRealRoot = realpathSync(projectRoot)
const displayRoutingChunks = createDisplayRoutingChunkClassifier(id => (
  matchesAppSafeLoggingModule(id) || matchesDisplayRoutingNeutralModule(id)
))
const shardCoverageReportsDirectory = process.env.VIZLY_COVERAGE_REPORTS_DIR
const isShardCoverage = process.env.TEST_CI_COVERAGE === '1'

const vendorChunkRules: Array<[string, string[]]> = [
  ['vendor-react', ['react', 'react-dom', 'react-router', 'react-error-boundary']],
  ['vendor-reactflow', ['@xyflow']],
  ['vendor-elk', ['elkjs']],
  ['vendor-three', ['three', '@react-three', 'troika-', 'webgl-sdf-generator', 'suspend-react', 'its-fine']],
  ['vendor-monaco', ['monaco-editor', '@monaco-editor']],
  ['vendor-i18n', ['i18next', 'react-i18next']],
  ['vendor-polyfills', ['core-js', '@babel/runtime', 'tslib', '@ungap/structured-clone']],
  ['vendor-markdown', [
    'react-markdown',
    'remark-',
    'rehype-',
    'marked',
    'mdast-',
    'micromark',
    'unified',
    'unist-',
    'vfile',
    'hast-',
    'property-information',
    'markdown-table',
    'decode-named-character-reference',
    'comma-separated-tokens',
    'space-separated-tokens',
    'style-to-',
    'trim-lines',
    'trough',
    'bail',
    'ccount',
    'devlop',
    'longest-streak',
  ]],
  ['vendor-supabase', ['@supabase']],
  ['vendor-aws-sdk', ['@aws-sdk', '@smithy', '@aws-crypto']],
  ['vendor-collab', ['yjs', 'y-websocket', 'lib0']],
  ['vendor-pdf-core', [
    'jspdf',
    'svg2pdf.js',
    'cssesc',
    'font-family-papandreou',
    'specificity',
    'svgpath',
  ]],
  ['vendor-canvas-export', [
    'html2canvas',
    'dompurify',
    'raf',
    'rgbcolor',
    'stackblur-canvas',
  ]],
  ['vendor-svg-render', [
    'canvg',
    'svg-pathdata',
  ]],
  ['vendor-dom-export', [
    'html-to-image',
    'fast-png',
    'iobuffer',
  ]],
  ['vendor-archive-export', [
    'jszip',
    'fflate',
    'pako',
  ]],
  ['vendor-gif-export', [
    'gifshot',
  ]],
  ['vendor-d3-interaction', [
    'd3-color',
    'd3-dispatch',
    'd3-drag',
    'd3-ease',
    'd3-interpolate',
    'd3-selection',
    'd3-timer',
    'd3-transition',
    'd3-zoom',
  ]],
  ['vendor-layout-graph', ['dagre', 'graphlib', 'd3-force', 'd3-quadtree']],
  ['vendor-mindmap', ['mind-elixir']],
  ['vendor-motion', ['framer-motion', '@react-spring', 'motion-dom', 'motion-utils']],
  ['vendor-drawing', ['roughjs', 'perfect-freehand']],
  ['vendor-state', ['zustand', 'immer', 'lodash', 'use-sync-external-store']],
]

const matchesNodePackage = (normalizedId: string, packageName: string) => {
  if (packageName === 'react') {
    return normalizedId.includes('/node_modules/react/');
  }
  return normalizedId.includes(`/node_modules/${packageName}`);
}

const matchesReactVendorPackage = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/');
  return (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom') ||
    normalizedId.includes('/node_modules/react-router') ||
    normalizedId.includes('/node_modules/react-error-boundary')
  );
}

const antdChunkBySegment: Record<string, string> = {
  affix: 'vendor-antd-navigation',
  alert: 'vendor-antd-feedback',
  anchor: 'vendor-antd-navigation',
  'auto-complete': 'vendor-antd-controls',
  avatar: 'vendor-antd-feedback',
  'back-top': 'vendor-antd-navigation',
  badge: 'vendor-antd-feedback',
  breadcrumb: 'vendor-antd-navigation',
  button: 'vendor-antd-input',
  calendar: 'vendor-antd-date',
  card: 'vendor-antd-layout',
  cascader: 'vendor-antd-select',
  checkbox: 'vendor-antd-input',
  col: 'vendor-antd-layout',
  collapse: 'vendor-antd-feedback',
  'color-picker': 'vendor-antd-input',
  'date-picker': 'vendor-antd-date',
  descriptions: 'vendor-antd-data',
  divider: 'vendor-antd-layout',
  drawer: 'vendor-antd-feedback',
  dropdown: 'vendor-antd-navigation',
  empty: 'vendor-antd-data',
  flex: 'vendor-antd-layout',
  form: 'vendor-antd-form',
  grid: 'vendor-antd-layout',
  image: 'vendor-antd-feedback',
  input: 'vendor-antd-input',
  'input-number': 'vendor-antd-input',
  layout: 'vendor-antd-layout',
  list: 'vendor-antd-data',
  menu: 'vendor-antd-navigation',
  message: 'vendor-antd-feedback',
  modal: 'vendor-antd-feedback',
  notification: 'vendor-antd-feedback',
  pagination: 'vendor-antd-data',
  popconfirm: 'vendor-antd-feedback',
  popover: 'vendor-antd-feedback',
  progress: 'vendor-antd-feedback',
  radio: 'vendor-antd-input',
  result: 'vendor-antd-feedback',
  row: 'vendor-antd-layout',
  segmented: 'vendor-antd-input',
  select: 'vendor-antd-select',
  skeleton: 'vendor-antd-feedback',
  slider: 'vendor-antd-input',
  space: 'vendor-antd-layout',
  spin: 'vendor-antd-feedback',
  statistic: 'vendor-antd-data',
  switch: 'vendor-antd-input',
  table: 'vendor-antd-data',
  tabs: 'vendor-antd-navigation',
  tag: 'vendor-antd-feedback',
  tooltip: 'vendor-antd-feedback',
  tree: 'vendor-antd-select',
  typography: 'vendor-antd-layout',
}

const rcChunkByPackage: Record<string, string> = {
  '@rc-component/async-validator': 'vendor-antd-form',
  '@rc-component/cascader': 'vendor-antd-select',
  '@rc-component/checkbox': 'vendor-antd-input',
  '@rc-component/color-picker': 'vendor-antd-input',
  '@rc-component/dialog': 'vendor-antd-feedback',
  '@rc-component/drawer': 'vendor-antd-feedback',
  '@rc-component/dropdown': 'vendor-antd-navigation',
  '@rc-component/form': 'vendor-antd-form',
  '@rc-component/image': 'vendor-antd-feedback',
  '@rc-component/input': 'vendor-antd-input',
  '@rc-component/input-number': 'vendor-antd-input',
  '@rc-component/menu': 'vendor-antd-navigation',
  '@rc-component/motion': 'vendor-antd-feedback',
  '@rc-component/notification': 'vendor-antd-feedback',
  '@rc-component/overflow': 'vendor-antd-navigation',
  '@rc-component/pagination': 'vendor-antd-data',
  '@rc-component/picker': 'vendor-antd-date',
  '@rc-component/portal': 'vendor-antd-feedback',
  '@rc-component/progress': 'vendor-antd-feedback',
  '@rc-component/resize-observer': 'vendor-antd-shared',
  '@rc-component/select': 'vendor-antd-select',
  '@rc-component/slider': 'vendor-antd-input',
  '@rc-component/table': 'vendor-antd-data',
  '@rc-component/tabs': 'vendor-antd-navigation',
  '@rc-component/tooltip': 'vendor-antd-feedback',
  '@rc-component/tree': 'vendor-antd-select',
  '@rc-component/trigger': 'vendor-antd-feedback',
  '@rc-component/util': 'vendor-antd-shared',
  '@rc-component/virtual-list': 'vendor-antd-data',
}

const antdUtilChunkByFile: Record<string, string> = {
  'ActionButton.js': 'vendor-antd-feedback',
  'ContextIsolator.js': 'vendor-antd-feedback',
  'PurePanel.js': 'vendor-antd-feedback',
  'colors.js': 'vendor-antd-input',
  'convertToTooltipProps.js': 'vendor-antd-feedback',
  'getAllowClear.js': 'vendor-antd-input',
  'getRenderPropValue.js': 'vendor-antd-feedback',
  'motion.js': 'vendor-antd-feedback',
  'placements.js': 'vendor-antd-feedback',
  'responsiveObserver.js': 'vendor-antd-layout',
  'scrollTo.js': 'vendor-antd-layout',
  'statusUtils.js': 'vendor-antd-input',
  'toList.js': 'vendor-antd-shared',
  'zindexContext.js': 'vendor-antd-feedback',
  'hooks/useClosable.js': 'vendor-antd-feedback',
  'hooks/useMergedMask.js': 'vendor-antd-feedback',
  'hooks/useMultipleSelect.js': 'vendor-antd-select',
  'hooks/useOrientation.js': 'vendor-antd-layout',
  'hooks/usePatchElement.js': 'vendor-antd-feedback',
  'hooks/useZIndex.js': 'vendor-antd-feedback',
  'wave/index.js': 'vendor-antd-feedback',
  'wave/interface.js': 'vendor-antd-feedback',
  'wave/style.js': 'vendor-antd-feedback',
  'wave/useWave.js': 'vendor-antd-feedback',
  'wave/util.js': 'vendor-antd-feedback',
  'wave/WaveEffect.js': 'vendor-antd-feedback',
};

const getAntdUtilChunk = (normalizedId: string) => {
  const marker = '/node_modules/antd/es/_util/';
  const utilPath = normalizedId.split(marker)[1];
  if (!utilPath) return undefined;
  return antdUtilChunkByFile[utilPath] ?? 'vendor-antd-core';
}

const getAntdChunk = (normalizedId: string) => {
  if (normalizedId.includes('/node_modules/antd/es/')) {
    const utilChunk = getAntdUtilChunk(normalizedId);
    if (utilChunk) {
      return utilChunk;
    }

    const antdCorePaths = [
      '/node_modules/antd/es/app/',
      '/node_modules/antd/es/config-provider/',
      '/node_modules/antd/es/locale/',
      '/node_modules/antd/es/style/',
      '/node_modules/antd/es/theme/',
    ];

    if (antdCorePaths.some((path) => normalizedId.includes(path))) {
      return 'vendor-antd-core';
    }

    const segment = normalizedId.split('/node_modules/antd/es/')[1]?.split('/')[0];
    return segment ? antdChunkBySegment[segment] : undefined;
  }

  if (
    normalizedId.includes('/node_modules/@ant-design/cssinjs') ||
    normalizedId.includes('/node_modules/@ant-design/cssinjs-utils') ||
    normalizedId.includes('/node_modules/@ant-design/colors') ||
    normalizedId.includes('/node_modules/@ant-design/fast-color')
  ) {
    return 'vendor-antd-core';
  }

  if (normalizedId.includes('/node_modules/@ant-design/')) {
    if (
      normalizedId.includes('/node_modules/@ant-design/icons') ||
      normalizedId.includes('/node_modules/@ant-design/icons-svg')
    ) {
      return 'vendor-icons';
    }
    return undefined;
  }

  for (const [packageName, chunkName] of Object.entries(rcChunkByPackage)) {
    if (normalizedId.includes(`/node_modules/${packageName}/`)) {
      return chunkName;
    }
  }
}

const getManualChunkName = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/');

  if (normalizedId.includes('node_modules')) {
    const antdChunk = getAntdChunk(normalizedId);
    if (antdChunk) {
      return antdChunk;
    }
    for (const [chunkName, packages] of vendorChunkRules) {
      if (packages.some((pkg) => matchesNodePackage(normalizedId, pkg))) {
        return chunkName;
      }
    }
    return 'vendor-core';
  }
}

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  plugins: [
    devCspPlugin(),
    jspdfRasterOnlyPlugin(),
    elkWorkerAssetPlugin(projectRoot),
    pdfFontAssetPlugin(projectRoot),
    sharedModuleWorkersPlugin(projectRoot),
    displayRoutingChunks.plugin,
    minifyLocaleAssetsPlugin(projectRoot),
    react(),
    tailwindcss(),
  ],
  worker: {
    format: 'es',
    plugins: () => [elkWorkerAssetPlugin(projectRoot)],
  },
  server: {
    fs: {
      allow: [projectRoot, projectRealRoot],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setupLocaleAssetFetch.ts'],
    // Workspace audit snapshots are complete repository mirrors. Vitest's
    // positional filters use substring matching, so a shard scoped to src/
    // would otherwise execute the mirrored tests with a second React runtime.
    exclude: [...configDefaults.exclude, '.codex-audit/**'],
    // Windows process startup dominates this suite: a representative isolated
    // jsdom shard dropped from 157.5s to 83.3s with threads. File isolation
    // remains enabled because shared environments leak mocks and storage state.
    pool: 'threads',
    coverage: {
      provider: 'v8',
      allowExternal: true,
      reporter: isShardCoverage ? ['json'] : ['text', 'html', 'json', 'lcov'],
      reportsDirectory: shardCoverageReportsDirectory || './.coverage',
      exclude: [
        'dist/**',
        'coverage/**',
        'node_modules/**',
        'src/**/*.d.ts',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/core/vite-env.d.ts',
      ],
      thresholds: isShardCoverage ? undefined : coverageThresholds,
    },
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, './src'),
    },
  },
  build: {
    modulePreload: false,
    reportCompressedSize: false,
    // Heavy optional engines (ELK/Three) are isolated into lazy vendor chunks.
    // Keep warnings for chunks that exceed those known upper bounds.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        chunkFileNames: productionChunkFileNames,
        codeSplitting: {
          groups: [
            {
              name: 'app-safe-logging',
              test: matchesAppSafeLoggingModule,
              priority: 120,
              minSize: 0,
            },
            {
              name: 'display-routing-neutral',
              test: matchesDisplayRoutingNeutralModule,
              priority: 115,
              minSize: 0,
            },
            {
              name: 'vendor-preload-runtime',
              test: (id) => {
                const normalizedId = id.replace(/\\/g, '/');
                return normalizedId.includes('vite/preload-helper') || normalizedId.includes('preload-helper');
              },
              priority: 100,
              minSize: 0,
            },
            {
              name: 'vendor-react',
              test: matchesReactVendorPackage,
              priority: 90,
              minSize: 0,
            },
            {
              name: 'display-routing-shared',
              test: displayRoutingChunks.matchesSharedModule,
              priority: 80,
              minSize: 0,
              entriesAware: false,
              includeDependenciesRecursively: false,
            },
            {
              name: 'flowchart-designer-startup',
              test: matchesFlowchartDesignerStartupModule,
              priority: 78,
              minSize: 0,
              entriesAware: false,
              includeDependenciesRecursively: false,
            },
            {
              name: 'flowchart-designer-micro',
              test: matchesFlowchartDesignerMicroModule,
              priority: 77,
              minSize: 0,
              entriesAware: false,
              includeDependenciesRecursively: false,
            },
            {
              name: 'flowchart-runtime-shared',
              test: matchesFlowchartRuntimeModule,
              priority: 75,
              minSize: 0,
            },
            {
              name: (id) => getManualChunkName(id),
            },
          ],
        },
      }
    }
  }
})
