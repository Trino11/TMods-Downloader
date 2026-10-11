import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
    plugins: [jsxInJs(), react()],
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
