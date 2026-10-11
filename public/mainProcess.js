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
    UPDATE_CHECK_INTERVAL_MS,
    MIN_WINDOW_SIZE,
    useDevServer,
    modrinthUserAgent,
    canAutoUpdate,
    startAutoUpdates,
    defaultWindowBounds,
    initialWindowState,
    loadWindowState,
    saveWindowState,
};
