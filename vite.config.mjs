import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const { CONTENT_SECURITY_POLICY } = createRequire(import.meta.url)('./public/mainProcess.js');

// The app keeps JSX in plain .js files (a Create React App habit), which Vite
// only parses in .jsx files, so compile JSX out of src/**/*.js first.
function jsxInJs() {
    return {
        name: 'jsx-in-js',
        enforce: 'pre',
        async transform(code, id) {
            if (!/\/src\/.*\.js$/.test(id.split('?')[0])) return null;
            return transformWithOxc(code, id, { lang: 'jsx', jsx: { runtime: 'automatic' } });
        },
    };
}

// The built page carries its Content-Security-Policy in a meta tag, since Electron loads
// it from disk where there are no response headers. The dev server goes without, as
// Vite's hot reload injects inline scripts.
function contentSecurityPolicy() {
    return {
        name: 'content-security-policy',
        apply: 'build',
        transformIndexHtml: () => [
            {
                tag: 'meta',
                attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
                injectTo: 'head-prepend',
            },
        ],
    };
}

export default defineConfig({
    plugins: [jsxInJs(), react(), contentSecurityPolicy()],
    // Relative asset paths, because Electron loads build/index.html from disk
    base: './',
    build: {
        outDir: 'build',
    },
    server: {
        port: 3000,
        strictPort: true,
    },
});
