// The main process's decisions, kept apart from Electron so Jest can test them.
// electron.js wires them to the real app, session and autoUpdater.

const DEV_SERVER_URL = 'http://localhost:3000';

// `npm start` passes --dev so the window loads the Vite dev server (with hot reload)
// instead of the built files. A packaged app always loads its own build.
function useDevServer(isPackaged, argv) {
    return !isPackaged && argv.includes('--dev');
}

// Modrinth asks every app using its API to identify itself in the User-Agent. The main
// process makes the page's web requests, so it sends this on all of them.
function tmodsUserAgent(appVersion) {
    return `Trino11/TMods-Downloader/${appVersion} (github.com/Trino11/TMods-Downloader)`;
}

// The policy the built page runs under (added as a meta tag at build time): its own
// scripts only, styles inline too (MUI writes them at runtime), images from the web
// (mod icons), and no network access of its own, since web requests go through the
// main process.
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
].join('; ');

// Whether `url` is the app's own page (`appUrl` is what the window loaded), so only it
// may use the bridge or be navigated to. The hash is the page's route, so it's ignored.
function isAppUrl(url, appUrl) {
    let page;
    let app;
    try {
        page = new URL(url);
        app = new URL(appUrl);
    } catch {
        return false;
    }
    if (app.protocol === 'file:') {
        return page.protocol === 'file:' && page.host === app.host && page.pathname === app.pathname;
    }
    return page.origin === app.origin;
}

// Links that would open a new window go to the system browser instead, if they're web
// pages; the app never opens windows of its own.
function externalLinkHandler(openExternal) {
    return ({ url }) => {
        try {
            if (new URL(url).protocol === 'https:') {
                openExternal(url);
            }
        } catch {
            // Not a URL; nothing to open.
        }
        return { action: 'deny' };
    };
}

// Looks for a new release once, when the app opens. Nothing is downloaded until the
// player picks an option in the page's update popup: `onAvailable({ version })` is told
// about the new version so the page can ask. A failed check is only logged.
function startAutoUpdates(autoUpdater, log, onAvailable) {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('error', error => log.error('Auto-update failed:', error));
    autoUpdater.on('update-available', info => onAvailable({ version: info.version }));

    // checkForUpdates resolves to null instead of a promise when updates are off.
    return Promise.resolve(autoUpdater.checkForUpdates()).catch(error => log.error('Update check failed:', error));
}

// What the popup's buttons do with an available update. "Install now" downloads it,
// then closes the app, installs it quietly and opens the new version. "Install on quit"
// downloads it in the background and installs it when the player closes the app.
// "Dismiss" needs nothing: the update is left alone until the app is opened again.
function createUpdateActions(autoUpdater) {
    return {
        async installNow() {
            await autoUpdater.downloadUpdate();
            autoUpdater.quitAndInstall(true, true);
        },
        async installOnQuit() {
            autoUpdater.autoInstallOnAppQuit = true;
            await autoUpdater.downloadUpdate();
        },
    };
}

// The page's update popup: it asks for the update found before it loaded, hears about
// one found later on UPDATE_CHANNELS.available, and picks what to do with it.
const UPDATE_CHANNELS = {
    pending: 'updates:pending',
    available: 'updates:available',
    installNow: 'updates:install-now',
    installOnQuit: 'updates:install-on-quit',
};

// `updates` is { pending() → { version } or null, installNow(), installOnQuit() }. Only
// the app's own page may use them, and only when there is an update to install.
function registerUpdateHandlers(ipcMain, updates, fromApp) {
    const allowed = event => fromApp(event) && Boolean(updates.pending());
    ipcMain.handle(UPDATE_CHANNELS.pending, event => (fromApp(event) ? updates.pending() : null));
    ipcMain.handle(UPDATE_CHANNELS.installNow, async event => {
        if (!allowed(event)) {
            return false;
        }
        await updates.installNow();
        return true;
    });
    ipcMain.handle(UPDATE_CHANNELS.installOnQuit, async event => {
        if (!allowed(event)) {
            return false;
        }
        await updates.installOnQuit();
        return true;
    });
}

// The Windows app identity (package.json's build.appId) that the installer stamps on the
// Start menu shortcut. The running app must use the same one: otherwise Windows takes its
// window for a different app, so a pin made from it points at the program file itself
// (which an update replaces, losing the pin) and its notifications don't show.
const APP_USER_MODEL_ID = 'com.trinohost.tmod_loader';

// macOS only installs updates for apps signed with a paid Apple Developer ID, and the
// Mac builds are unsigned, so they skip update checks rather than fail on every one.
function canAutoUpdate(platform) {
    return platform !== 'darwin';
}

// The window opens at this share of the screen's work area (the screen minus the taskbar)...
const DEFAULT_SCREEN_SHARE = 0.8;
// ...and can't be made smaller than this, the smallest size the pages are laid out for.
const MIN_WINDOW_SIZE = { width: 800, height: 600 };
// A saved position is reused only if at least this much of the window would be on a screen.
const MIN_VISIBLE = { width: 200, height: 100 };

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

// A window covering most of the screen, centered on it.
function defaultWindowBounds(workArea) {
    const width = Math.min(
        workArea.width,
        Math.max(MIN_WINDOW_SIZE.width, Math.round(workArea.width * DEFAULT_SCREEN_SHARE)),
    );
    const height = Math.min(
        workArea.height,
        Math.max(MIN_WINDOW_SIZE.height, Math.round(workArea.height * DEFAULT_SCREEN_SHARE)),
    );
    return {
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 2),
        width,
        height,
    };
}

function visibleArea(bounds, workArea) {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return { width: Math.max(0, width), height: Math.max(0, height) };
}

// Where the window opens: where the user left it last time, unless that is no longer
// on any screen (say a monitor was unplugged), in which case the default on the primary one.
function initialWindowState(saved, workAreas, primaryWorkArea) {
    const fallback = { bounds: defaultWindowBounds(primaryWorkArea), isMaximized: false };
    const bounds = saved && saved.bounds;
    if (!bounds || !['x', 'y', 'width', 'height'].every(key => isFiniteNumber(bounds[key]))) {
        return fallback;
    }
    const sized = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(MIN_WINDOW_SIZE.width, Math.round(bounds.width)),
        height: Math.max(MIN_WINDOW_SIZE.height, Math.round(bounds.height)),
    };
    const screenArea = workAreas.find(workArea => {
        const visible = visibleArea(sized, workArea);
        return visible.width >= MIN_VISIBLE.width && visible.height >= MIN_VISIBLE.height;
    });
    if (!screenArea) {
        return fallback;
    }
    // A window saved on a bigger screen still has to fit the one it opens on.
    sized.width = Math.min(sized.width, Math.max(MIN_WINDOW_SIZE.width, screenArea.width));
    sized.height = Math.min(sized.height, Math.max(MIN_WINDOW_SIZE.height, screenArea.height));
    return { bounds: sized, isMaximized: saved.isMaximized === true };
}

// The saved state, or null when there is none yet or the file can't be read.
function loadWindowState(fs, file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

// Saves the window's normal (unmaximized) bounds, so un-maximizing after a restart
// goes back to the size the user picked.
function saveWindowState(fs, file, window) {
    const state = { bounds: window.getNormalBounds(), isMaximized: window.isMaximized() };
    try {
        fs.writeFileSync(file, JSON.stringify(state));
    } catch {
        // Not remembering the window is better than failing to close it.
    }
}

// IPC channels the Settings page uses to show the app's log file.
const LOG_CHANNELS = {
    getPath: 'logs:get-path',
    openFile: 'logs:open-file',
    showInFolder: 'logs:show-in-folder',
};

// Lets the page find and open the log file, which it can't do itself: opening a file
// in the system's default app is the main process's job. logFile() returns its path.
// Each handler resolves to an error message, or '' when it worked.
function registerLogHandlers(ipcMain, shell, fs, path, logFile) {
    ipcMain.handle(LOG_CHANNELS.getPath, () => logFile());
    ipcMain.handle(LOG_CHANNELS.openFile, async () => {
        const file = logFile();
        if (!fs.existsSync(file)) {
            return `There is no log file yet at ${file}.`;
        }
        // openPath resolves to an error message, or '' on success.
        return shell.openPath(file);
    });
    ipcMain.handle(LOG_CHANNELS.showInFolder, async () => {
        const file = logFile();
        if (fs.existsSync(file)) {
            shell.showItemInFolder(file);
            return '';
        }
        const folder = path.dirname(file);
        if (!fs.existsSync(folder)) {
            return `There is no log folder yet at ${folder}.`;
        }
        return shell.openPath(folder);
    });
}

module.exports = {
    LOG_CHANNELS,
    registerLogHandlers,
    DEV_SERVER_URL,
    MIN_WINDOW_SIZE,
    useDevServer,
    tmodsUserAgent,
    CONTENT_SECURITY_POLICY,
    isAppUrl,
    externalLinkHandler,
    canAutoUpdate,
    startAutoUpdates,
    createUpdateActions,
    UPDATE_CHANNELS,
    registerUpdateHandlers,
    APP_USER_MODEL_ID,
    defaultWindowBounds,
    initialWindowState,
    loadWindowState,
    saveWindowState,
};
