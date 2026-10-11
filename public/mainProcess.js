// The main process's decisions, kept apart from Electron so Jest can test them.
// electron.js wires them to the real app, session and autoUpdater.

const DEV_SERVER_URL = 'http://localhost:3000';

// How often a running app looks for a new release.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// `npm start` passes --dev so the window loads the Vite dev server (with hot reload)
// instead of the built files. A packaged app always loads its own build.
function useDevServer(isPackaged, argv) {
    return !isPackaged && argv.includes('--dev');
}

// Modrinth asks every app using its API to identify itself in the User-Agent, which
// the page itself isn't allowed to set. Returns an onBeforeSendHeaders listener.
function modrinthUserAgent(appVersion) {
    const userAgent = `Trino11/TMods-Downloader/${appVersion} (github.com/Trino11/TMods-Downloader)`;
    return (details, callback) => {
        callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': userAgent } });
    };
}

// Updates download in the background; the OS notification says when one is ready,
// and it installs on the next quit. A failed check is logged and retried next time.
function startAutoUpdates(autoUpdater, log, schedule = setInterval) {
    autoUpdater.logger = log;
    autoUpdater.on('error', error => log.error('Auto-update failed:', error));

    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(error => log.error('Update check failed:', error));
    check();
    return schedule(check, UPDATE_CHECK_INTERVAL_MS);
}

module.exports = { DEV_SERVER_URL, UPDATE_CHECK_INTERVAL_MS, useDevServer, modrinthUserAgent, startAutoUpdates };
