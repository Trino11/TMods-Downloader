const {
    CONTENT_SECURITY_POLICY,
    DEV_SERVER_URL,
    externalLinkHandler,
    isAppUrl,
    canAutoUpdate,
    linuxPasswordStore,
    startAutoUpdates,
    createUpdateActions,
    registerUpdateHandlers,
    UPDATE_CHANNELS,
    APP_USER_MODEL_ID,
    tmodsUserAgent,
    useDevServer,
} = require('../../public/mainProcess');

describe('useDevServer', () => {
    it('uses the dev server only for an unpackaged app started with --dev', () => {
        expect(useDevServer(false, ['electron', '.', '--dev'])).toBe(true);
        expect(useDevServer(false, ['electron', '.'])).toBe(false);
        expect(useDevServer(true, ['Tmods Downloader.exe', '--dev'])).toBe(false);
    });
});

describe('tmodsUserAgent', () => {
    it('names the app, its version and where to find it, as Modrinth asks', () => {
        expect(tmodsUserAgent('1.2.3')).toBe('Trino11/TMods-Downloader/1.2.3 (github.com/Trino11/TMods-Downloader)');
    });
});

describe('isAppUrl', () => {
    const built = 'file:///C:/Program%20Files/TMods/resources/app.asar/build/index.html';

    it('accepts the built page on any route', () => {
        expect(isAppUrl(built, built)).toBe(true);
        expect(isAppUrl(`${built}#/modrinth`, built)).toBe(true);
    });

    it('refuses other files and other sites', () => {
        expect(isAppUrl('file:///C:/Users/me/evil.html', built)).toBe(false);
        expect(isAppUrl('https://example.com/', built)).toBe(false);
        expect(isAppUrl('not a url', built)).toBe(false);
    });

    it('accepts any page of the dev server, and only it', () => {
        expect(isAppUrl('http://localhost:3000/#/settings', DEV_SERVER_URL)).toBe(true);
        expect(isAppUrl('http://localhost:3001/', DEV_SERVER_URL)).toBe(false);
        expect(isAppUrl('https://localhost:3000/', DEV_SERVER_URL)).toBe(false);
    });
});

describe('externalLinkHandler', () => {
    it('opens web links in the browser and never a window in the app', () => {
        const openExternal = jest.fn();
        const handler = externalLinkHandler(openExternal);

        expect(handler({ url: 'https://modrinth.com/mod/sodium' })).toEqual({ action: 'deny' });
        expect(openExternal).toHaveBeenCalledWith('https://modrinth.com/mod/sodium');
    });

    it('opens nothing that is not a web page', () => {
        const openExternal = jest.fn();
        const handler = externalLinkHandler(openExternal);

        for (const url of ['file:///C:/Windows/System32/calc.exe', 'http://example.com', 'smb://host/share', 'x']) {
            expect(handler({ url })).toEqual({ action: 'deny' });
        }
        expect(openExternal).not.toHaveBeenCalled();
    });
});

describe('CONTENT_SECURITY_POLICY', () => {
    it("allows only the app's own scripts and no network access from the page", () => {
        expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
        expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
        expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
        expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/);
    });
});

describe('startAutoUpdates', () => {
    function fakeUpdater(result) {
        const listeners = {};
        return {
            listeners,
            on: jest.fn((event, listener) => (listeners[event] = listener)),
            checkForUpdates: jest.fn(() => result),
        };
    }

    it('checks once, without downloading or installing anything on its own', () => {
        const updater = fakeUpdater(Promise.resolve());

        startAutoUpdates(updater, { error: jest.fn() }, jest.fn());

        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(updater.autoDownload).toBe(false);
        expect(updater.autoInstallOnAppQuit).toBe(false);
    });

    it('logs a failed check instead of crashing', async () => {
        const failure = new Error('offline');
        const updater = fakeUpdater(Promise.reject(failure));
        const log = { error: jest.fn() };

        await startAutoUpdates(updater, log, jest.fn());

        expect(log.error).toHaveBeenCalledWith('Update check failed:', failure);
        expect(updater.logger).toBe(log);
    });

    it('logs updater errors', () => {
        const updater = fakeUpdater(Promise.resolve());
        const log = { error: jest.fn() };

        startAutoUpdates(updater, log, jest.fn());
        updater.listeners.error(new Error('bad signature'));

        expect(log.error).toHaveBeenCalledWith('Auto-update failed:', expect.any(Error));
    });

    it('says which version is out when it finds one', () => {
        const updater = fakeUpdater(Promise.resolve());
        const onAvailable = jest.fn();

        startAutoUpdates(updater, { error: jest.fn() }, onAvailable);
        updater.listeners['update-available']({ version: '0.4.2', releaseNotes: '<p>html</p>' });

        expect(onAvailable).toHaveBeenCalledWith({ version: '0.4.2' });
    });
});

describe('createUpdateActions', () => {
    function fakeUpdater() {
        return { autoInstallOnAppQuit: false, downloadUpdate: jest.fn(async () => {}), quitAndInstall: jest.fn() };
    }

    it('installs now: downloads, then restarts into the new version', async () => {
        const updater = fakeUpdater();
        await createUpdateActions(updater).installNow();
        expect(updater.downloadUpdate).toHaveBeenCalled();
        expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it('does not restart when the download fails', async () => {
        const updater = fakeUpdater();
        updater.downloadUpdate.mockRejectedValue(new Error('offline'));
        await expect(createUpdateActions(updater).installNow()).rejects.toThrow('offline');
        expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('installs on quit: downloads and leaves the install for when the app closes', async () => {
        const updater = fakeUpdater();
        await createUpdateActions(updater).installOnQuit();
        expect(updater.downloadUpdate).toHaveBeenCalled();
        expect(updater.autoInstallOnAppQuit).toBe(true);
        expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });
});

describe('registerUpdateHandlers', () => {
    function setup(pending, isApp = true) {
        const handlers = {};
        const ipcMain = { handle: (channel, handler) => (handlers[channel] = handler) };
        const updates = { pending: () => pending, installNow: jest.fn(), installOnQuit: jest.fn() };
        registerUpdateHandlers(ipcMain, updates, () => isApp);
        return { handlers, updates };
    }

    it('tells the page about the update it found', () => {
        const { handlers } = setup({ version: '0.4.2' });
        expect(handlers[UPDATE_CHANNELS.pending]({})).toEqual({ version: '0.4.2' });
    });

    it('installs now or on quit when the page asks', async () => {
        const { handlers, updates } = setup({ version: '0.4.2' });
        await expect(handlers[UPDATE_CHANNELS.installNow]({})).resolves.toBe(true);
        await expect(handlers[UPDATE_CHANNELS.installOnQuit]({})).resolves.toBe(true);
        expect(updates.installNow).toHaveBeenCalled();
        expect(updates.installOnQuit).toHaveBeenCalled();
    });

    it('does nothing when there is no update', async () => {
        const { handlers, updates } = setup(null);
        await expect(handlers[UPDATE_CHANNELS.installNow]({})).resolves.toBe(false);
        await expect(handlers[UPDATE_CHANNELS.installOnQuit]({})).resolves.toBe(false);
        expect(updates.installNow).not.toHaveBeenCalled();
        expect(updates.installOnQuit).not.toHaveBeenCalled();
    });

    it('ignores pages other than the app', async () => {
        const { handlers, updates } = setup({ version: '0.4.2' }, false);
        expect(handlers[UPDATE_CHANNELS.pending]({})).toBeNull();
        await expect(handlers[UPDATE_CHANNELS.installNow]({})).resolves.toBe(false);
        expect(updates.installNow).not.toHaveBeenCalled();
    });
});

describe('APP_USER_MODEL_ID', () => {
    it('matches the appId the installer gives the shortcuts', () => {
        expect(APP_USER_MODEL_ID).toBe(require('../../package.json').build.appId);
    });
});

describe('canAutoUpdate', () => {
    test('updates on Windows and Linux but not on the unsigned Mac build', () => {
        expect(canAutoUpdate('win32')).toBe(true);
        expect(canAutoUpdate('linux')).toBe(true);
        expect(canAutoUpdate('darwin')).toBe(false);
    });
});

describe('linuxPasswordStore', () => {
    test('points window managers Chromium has no keyring for at the Secret Service', () => {
        expect(linuxPasswordStore('linux', { XDG_CURRENT_DESKTOP: 'Hyprland' }, false)).toBe('gnome-libsecret');
        expect(linuxPasswordStore('linux', { DESKTOP_SESSION: 'i3' }, false)).toBe('gnome-libsecret');
        expect(linuxPasswordStore('linux', {}, false)).toBe('gnome-libsecret');
        expect(linuxPasswordStore('linux', { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }, false)).toBe('gnome-libsecret');
    });

    test('leaves KDE on KWallet', () => {
        expect(linuxPasswordStore('linux', { XDG_CURRENT_DESKTOP: 'KDE' }, false)).toBeNull();
        expect(linuxPasswordStore('linux', { DESKTOP_SESSION: 'plasmawayland' }, false)).toBeNull();
        expect(linuxPasswordStore('linux', { KDE_FULL_SESSION: 'true' }, false)).toBeNull();
    });

    test('respects a --password-store the user passed, and other systems', () => {
        expect(linuxPasswordStore('linux', { XDG_CURRENT_DESKTOP: 'sway' }, true)).toBeNull();
        expect(linuxPasswordStore('win32', {}, false)).toBeNull();
        expect(linuxPasswordStore('darwin', {}, false)).toBeNull();
    });
});
