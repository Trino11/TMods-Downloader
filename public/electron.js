const { app, BrowserWindow, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const {
    DEV_SERVER_URL,
    MIN_WINDOW_SIZE,
    initialWindowState,
    loadWindowState,
    modrinthUserAgent,
    registerLogHandlers,
    saveWindowState,
    startAutoUpdates,
    useDevServer,
} = require('./mainProcess');

const isDev = useDevServer(app.isPackaged, process.argv);

let mainWindow = null;

function createWindow() {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    const { bounds, isMaximized } = initialWindowState(
        loadWindowState(fs, stateFile),
        screen.getAllDisplays().map(display => display.workArea),
        screen.getPrimaryDisplay().workArea,
    );

    mainWindow = new BrowserWindow({
        ...bounds,
        minWidth: MIN_WINDOW_SIZE.width,
        minHeight: MIN_WINDOW_SIZE.height,
        // Shown once ready, so a maximized window doesn't flash at its normal size first.
        show: false,
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

    mainWindow.once('ready-to-show', () => {
        if (isMaximized) {
            mainWindow.maximize();
        }
        mainWindow.show();
    });
    mainWindow.on('close', () => saveWindowState(fs, stateFile, mainWindow));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://api.modrinth.com/*'] },
        modrinthUserAgent(app.getVersion()),
    );
    registerLogHandlers(ipcMain, shell, fs, path, () => log.transports.file.getFile().path);
    // One line per start, so the log file exists for the Settings page to open.
    log.info(`TMods Downloader ${app.getVersion()} started`);
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
