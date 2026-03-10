import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/features/**',
            '**/features/company/types',
            '**/features/company/legacy-types',
          ],
        },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/application/**',
            '**/domain/**',
            '**/infrastructure/**',
            '**/components/**',
            '**/lib/**',
            '**/features/backend/**',
            '**/features/gateway/**',
            '**/features/execution/**',
            '**/features/org/**',
            '**/features/company/**',
            '**/features/company/types',
            '**/features/company/legacy-types',
          ],
        },
      ],
    },
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/infrastructure/**',
            '**/features/backend/**',
            '**/features/gateway/**',
            '**/features/execution/**',
            '**/features/org/**',
            '**/features/company/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/pages/**',
            '**/presentation/**',
            '**/features/backend/**',
            '**/features/gateway/**',
            '**/features/execution/**',
            '**/features/org/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/application/**',
            '**/infrastructure/**',
            '**/pages/**',
            '**/components/**',
            '**/features/company/types',
            '**/features/company/legacy-types',
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/pages/AutomationPage.tsx',
      'src/pages/WorkspacePage.tsx',
      'src/presentation/board/Page.tsx',
      'src/presentation/ceo/Page.tsx',
      'src/presentation/chat/Page.tsx',
      'src/presentation/lobby/Page.tsx',
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
])
