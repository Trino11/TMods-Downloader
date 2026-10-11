const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { DEV_SERVER_URL, modrinthUserAgent, startAutoUpdates, useDevServer } = require('./mainProcess');

const isDev = useDevServer(app.isPackaged, process.argv);

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

app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://api.modrinth.com/*'] },
        modrinthUserAgent(app.getVersion()),
    );
    createWindow();
    // There are no releases to update to from a development checkout.
    if (app.isPackaged) {
        log.transports.file.level = 'info';
        startAutoUpdates(autoUpdater, log);
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
