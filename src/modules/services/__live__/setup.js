// Runs the page's service modules in plain Node, the way they run in the app, only
// talking to the real services. Their file, hash and zip calls go to the main process's
// own bridge code (public/bridge.js), allowed to work in the temp folder, just as the
// unit tests do; web requests go straight out through axios.
import axios from 'axios';
import os from 'os';
import { version } from '../../../../package.json';
import { installBridge } from '../__fixtures__/bridge';

global.window = global.window || {};
installBridge(os.tmpdir());

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
