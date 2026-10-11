import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    { ignores: ['build/', 'dist/', 'coverage/'] },
    js.configs.recommended,
    {
        // The app keeps JSX in .js files.
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser },
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-unused-vars': ['error', { ignoreRestSiblings: true }],
        },
    },
    {
        files: ['src/**/__tests__/**', 'src/**/__fixtures__/**', 'src/**/__live__/**', 'src/setupTests.js', 'test/**'],
        languageOptions: { globals: { ...globals.jest, ...globals.node } },
    },
    {
        // The Electron main process and build configs run in Node.
        files: ['public/*.js', '*.config.{js,mjs}', 'test/**'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    },
    {
        files: ['*.config.mjs'],
        languageOptions: { sourceType: 'module' },
    },
    prettier,
];
