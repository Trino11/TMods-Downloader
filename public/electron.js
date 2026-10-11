const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// `npm start` passes --dev so the window loads the Vite dev server (with hot reload)
// instead of the built files. A packaged app always loads its own build.
const DEV_SERVER_URL = 'http://localhost:3000';
const isDev = !app.isPackaged && process.argv.includes('--dev');

// How often a running app looks for a new release.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            contextIsolation: false,
            webSecurity: false, // Disables CORS restrictions
        },
    });

    if (isDev) {
        // Electron and Vite start together, so the dev server may not be up yet: retry.
        mainWindow.webContents.on('did-fail-load', () => {
            setTimeout(() => mainWindow && mainWindow.loadURL(DEV_SERVER_URL), 1000);
        });
        mainWindow.loadURL(DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Modrinth asks every app using its API to identify itself in the User-Agent, which
// the page itself isn't allowed to set.
function identifyToModrinth() {
    const userAgent = `Trino11/TMods-Downloader/${app.getVersion()} (github.com/Trino11/TMods-Downloader)`;
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://api.modrinth.com/*'] },
        (details, callback) => {
            callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': userAgent } });
        },
    );
}

// Updates download in the background; the OS notification says when one is ready,
// and it installs on the next quit.
function startAutoUpdates() {
    autoUpdater.logger = log;
    log.transports.file.level = 'info';
    autoUpdater.on('error', error => log.error('Auto-update failed:', error));

    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(error => log.error('Update check failed:', error));
    check();
    setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

app.whenReady().then(() => {
    identifyToModrinth();
    createWindow();
    // There are no releases to update to from a development checkout.
    if (app.isPackaged) {
        startAutoUpdates();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
