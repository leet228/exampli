// eslint.config.js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
    // игнор сборки
    globalIgnores(['dist', 'node_modules']),

    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            // можно оставить базовый набор без type-aware правил (менее строгий)
            tseslint.configs.recommended,
            reactHooks.configs['recommended-latest'],
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        rules: {
            // выключаем базовое правило, чтобы не конфликтовало с TS-версией
            'no-unused-vars': 'off',

            // делаем предупреждение вместо ошибки и игнорим имена, начинающиеся с "_"
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],

            // если раздражает — полностью отключи:
            // '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': ['warn', { allowEmptyCatch: true }],

            // ослабляем ещё несколько популярных «строгих» правил
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',

            // правило из react-refresh часто красит экспортные хуки — смягчим
            'react-refresh/only-export-components': 'warn',
        },
    },
])