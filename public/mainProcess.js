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

// Updates download in the background; the OS notification says when one is ready,
// and it installs on the next quit. A failed check is logged and retried next time.
function startAutoUpdates(autoUpdater, log, schedule = setInterval) {
    autoUpdater.logger = log;
    autoUpdater.on('error', error => log.error('Auto-update failed:', error));

    const check = () => autoUpdater.checkForUpdatesAndNotify().catch(error => log.error('Update check failed:', error));
    check();
    return schedule(check, UPDATE_CHECK_INTERVAL_MS);
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

module.exports = {
    DEV_SERVER_URL,
    UPDATE_CHECK_INTERVAL_MS,
    MIN_WINDOW_SIZE,
    useDevServer,
    tmodsUserAgent,
    CONTENT_SECURITY_POLICY,
    isAppUrl,
    externalLinkHandler,
    startAutoUpdates,
    defaultWindowBounds,
    initialWindowState,
    loadWindowState,
    saveWindowState,
};
