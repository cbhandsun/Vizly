# React + TypeScript + Vite

## Local Verification

Run the core local gate before handing off changes:

```powershell
npm run verify
```

This checks that generated artifacts are not tracked, scans tracked text files for common secret patterns, runs the dependency advisory check, then runs TypeScript, ESLint, the production build, and bundle budgets.

Bundle budget limits can be adjusted with `BUNDLE_MAX_JS_CHUNK_KB`, `BUNDLE_MAX_JS_GZIP_CHUNK_KB`, `BUNDLE_MAX_CSS_CHUNK_KB`, `BUNDLE_MAX_CSS_GZIP_CHUNK_KB`, and `BUNDLE_MAX_TOTAL_JS_KB`.

You can also run the dependency advisory check by itself when reviewing dependency changes:

```powershell
npm run check:audit
```

This intentionally omits optional native/wasm packages because npm can mark cross-platform optional packages as extraneous on Windows, which makes bare `npm audit` fail before advisory evaluation.

Run the stable low-concurrency test gate for core safety, data, algorithm, UI, routing, and worker coverage:

```powershell
npm run test:ci
```

This first checks that every `src/**/__tests__/*.test.ts(x)` and `supabase/**/__tests__/*.test.ts(x)` file is assigned to a CI shard, then runs split Vitest shards for node-only logic, jsdom/browser APIs, UI guards, core components, mind map behavior, and routing/layout internals.

`npm run test:all:lowcpu` runs the full Vitest suite with reduced worker concurrency. It is intentionally separate from `npm run verify` because the full suite is currently too slow for the default local gate.

## Route Smoke Checks

Build first, then run the route smoke check:

```powershell
npm run build
npm run smoke:routes
```

Set `SMOKE_REPORT=1` to print per-route asset diagnostics. Set `SMOKE_BUDGET=1` to enforce route asset budgets for critical asset count, critical decoded KB, and ready time.
Set `SMOKE_ROUTES=warehouse-3d` to run one or more comma-separated routes while debugging a specific route budget.
Set `SMOKE_REPEAT=3` to sample each selected route multiple times; budgets use the upper median sample metrics and reports include the worst ready time.

Budget overrides:

```powershell
$env:SMOKE_BUDGET='1'
$env:SMOKE_MAX_CRITICAL_ASSETS='100'
$env:SMOKE_BUDGET_DEFAULT_DIAGRAM_CRITICAL_DECODED_KB='4100'
npm run smoke:routes
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
