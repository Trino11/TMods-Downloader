// Runs the page's service modules in plain Node, the way they run in the app, only
// talking to the real services. Node modules are handed to the services directly
// instead of through Electron, so these checks don't depend on how the app reaches Node.
import axios from 'axios';
import { version } from '../../../../package.json';

jest.mock('../node', () => ({
    fs: require('fs'),
    os: require('os'),
    path: require('path'),
    crypto: require('crypto'),
    Buffer: require('buffer').Buffer,
    AdmZip: require('adm-zip'),
}));

// The version list keeps its last fetch in localStorage, which Node doesn't have.
const store = new Map();
global.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
};

// Modrinth asks every client to identify itself; this is the app's own User-Agent
// (public/mainProcess.js), marked as coming from CI.
axios.defaults.headers.common['User-Agent'] =
    `Trino11/TMods-Downloader/${version}-live-checks (github.com/Trino11/TMods-Downloader)`;

// A dropped connection shouldn't fail the run; a second failure is real.
jest.retryTimes(1, { logErrorsBeforeRetry: true });
