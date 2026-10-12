const { app, BrowserWindow, ipcMain, net, safeStorage, screen, session, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const {
    APP_USER_MODEL_ID,
    DEV_SERVER_URL,
    MIN_WINDOW_SIZE,
    externalLinkHandler,
    canAutoUpdate,
    initialWindowState,
    isAppUrl,
    loadWindowState,
    registerLogHandlers,
    registerUpdateHandlers,
    saveWindowState,
    startAutoUpdates,
    tmodsUserAgent,
    UPDATE_CHANNELS,
    useDevServer,
} = require('./mainProcess');
const { createBridge, createHttp, defaultMinecraftDir } = require('./bridge');
const { createBundlePublisher, registerGitHubHandlers } = require('./bundlePublisher');

const isDev = useDevServer(app.isPackaged, process.argv);
const indexFile = path.join(__dirname, 'index.html');
const appUrl = isDev ? DEV_SERVER_URL : pathToFileURL(indexFile).href;

// Same identity as the installer's shortcuts, so pins and notifications belong to them.
if (process.platform === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID);
}

let mainWindow = null;
// The downloaded update waiting to be installed ({ version }), for the page's popup.
let readyUpdate = null;

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
            // The page gets no Node: it reaches files and the web only through the calls
            // preload.js exposes, which bridge.js checks.
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    });

    if (isDev) {
        // Electron and Vite start together, so the dev server may not be up yet: retry.
        mainWindow.webContents.on('did-fail-load', () => {
            setTimeout(() => mainWindow && mainWindow.loadURL(DEV_SERVER_URL), 1000);
        });
        mainWindow.loadURL(DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(indexFile);
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

// Answers the page's calls, but only from the app's own page: anything else that ends up
// in a frame gets nothing.
function listenToPage() {
    const bridge = createBridge({
        fs,
        path,
        crypto,
        AdmZip,
        platform: process.platform,
        minecraftDir: defaultMinecraftDir(path, process.platform, os.homedir()),
    });
    const userAgent = tmodsUserAgent(app.getVersion());
    const http = createHttp(net.fetch, userAgent);
    const fromApp = event => Boolean(event.senderFrame) && isAppUrl(event.senderFrame.url, appUrl);

    ipcMain.on('tmods:info', event => {
        event.returnValue = fromApp(event) ? bridge.info : { methods: [] };
    });
    ipcMain.on('tmods:call', (event, method, args) => {
        event.returnValue = fromApp(event) ? bridge.call(method, args) : { error: 'Not allowed.' };
    });
    ipcMain.handle('tmods:http', (event, request) => {
        if (!fromApp(event)) {
            throw new Error('Not allowed.');
        }
        return http(request);
    });

    const publisher = createBundlePublisher({
        fetch: net.fetch,
        safeStorage,
        fs,
        tokenFile: path.join(app.getPath('userData'), 'github-token.bin'),
        userAgent,
    });
    registerGitHubHandlers(ipcMain, publisher, fromApp);

    registerUpdateHandlers(
        ipcMain,
        {
            pending: () => readyUpdate,
            // Installs quietly and starts the new version once it's in.
            install: () => autoUpdater.quitAndInstall(true, true),
        },
        fromApp,
    );
}

// The window only ever shows the app: no navigating away, no new windows (web links
// open in the browser), no embedded pages, and no camera, notifications and the like.
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (navigation, url) => {
        if (!isAppUrl(url, appUrl)) {
            navigation.preventDefault();
        }
    });
    contents.on('will-attach-webview', attach => attach.preventDefault());
    contents.setWindowOpenHandler(externalLinkHandler(url => shell.openExternal(url)));
});

app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
    listenToPage();
    registerLogHandlers(ipcMain, shell, fs, path, () => log.transports.file.getFile().path);
    // One line per start, so the log file exists for the Settings page to open.
    log.info(`TMods Downloader ${app.getVersion()} started`);
    createWindow();
    // There are no releases to update to from a development checkout.
    if (app.isPackaged && canAutoUpdate(process.platform)) {
        log.transports.file.level = 'info';
        startAutoUpdates(autoUpdater, log, update => {
            readyUpdate = update;
            if (mainWindow) {
                mainWindow.webContents.send(UPDATE_CHANNELS.ready, update);
            }
        });
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
