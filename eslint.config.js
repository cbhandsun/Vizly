import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-ssr',
    'coverage',
    '.coverage',
    '.codex-audit',
    'test-results',
    'scratch',
    '.tmp-vizly-smoke-profile-*',
    'thumbnails',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      
      // React Compiler (eslint-plugin-react-hooks v7)
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',

      // Stylistic and non-blocking rules
      'prefer-const': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-constant-condition': 'warn',
      'no-constant-binary-expression': 'warn',
    }
  },
  {
    files: [
      'src/core/plugins/**/*.tsx',
      'src/components/diagrams/plugins/**/*.tsx',
    ],
    rules: {
      // Plugin modules intentionally export plugin classes plus local contribution components.
      'react-refresh/only-export-components': 'off',
    },
  },
])
