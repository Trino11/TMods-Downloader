const {
    CONTENT_SECURITY_POLICY,
    DEV_SERVER_URL,
    UPDATE_CHECK_INTERVAL_MS,
    externalLinkHandler,
    isAppUrl,
    canAutoUpdate,
    startAutoUpdates,
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

    it('checks right away and then on a schedule', () => {
        const updater = fakeUpdater(Promise.resolve());
        const schedule = jest.fn();

        startAutoUpdates(updater, { error: jest.fn() }, jest.fn(), schedule);

        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(schedule).toHaveBeenCalledWith(expect.any(Function), UPDATE_CHECK_INTERVAL_MS);
        schedule.mock.calls[0][0]();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('logs a failed check instead of crashing', async () => {
        const failure = new Error('offline');
        const updater = fakeUpdater(Promise.reject(failure));
        const log = { error: jest.fn() };

        startAutoUpdates(updater, log, jest.fn(), jest.fn());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(log.error).toHaveBeenCalledWith('Update check failed:', failure);
        expect(updater.logger).toBe(log);
    });

    it('logs updater errors', () => {
        const updater = fakeUpdater(Promise.resolve());
        const log = { error: jest.fn() };

        startAutoUpdates(updater, log, jest.fn(), jest.fn());
        updater.listeners.error(new Error('bad signature'));

        expect(log.error).toHaveBeenCalledWith('Auto-update failed:', expect.any(Error));
    });

    it('says which version is ready once an update has downloaded', () => {
        const updater = fakeUpdater(Promise.resolve());
        const onReady = jest.fn();

        startAutoUpdates(updater, { error: jest.fn() }, onReady, jest.fn());
        updater.listeners['update-downloaded']({ version: '0.4.2', releaseNotes: '<p>html</p>' });

        expect(onReady).toHaveBeenCalledWith({ version: '0.4.2' });
    });
});

describe('registerUpdateHandlers', () => {
    function setup(pending, isApp = true) {
        const handlers = {};
        const ipcMain = { handle: (channel, handler) => (handlers[channel] = handler) };
        const updates = { pending: () => pending, install: jest.fn() };
        registerUpdateHandlers(ipcMain, updates, () => isApp);
        return { handlers, updates };
    }

    it('tells the page about an update that is ready', () => {
        const { handlers } = setup({ version: '0.4.2' });
        expect(handlers[UPDATE_CHANNELS.pending]({})).toEqual({ version: '0.4.2' });
    });

    it('installs the ready update when the page asks', () => {
        const { handlers, updates } = setup({ version: '0.4.2' });
        expect(handlers[UPDATE_CHANNELS.install]({})).toBe(true);
        expect(updates.install).toHaveBeenCalled();
    });

    it('does nothing when no update is ready', () => {
        const { handlers, updates } = setup(null);
        expect(handlers[UPDATE_CHANNELS.install]({})).toBe(false);
        expect(updates.install).not.toHaveBeenCalled();
    });

    it('ignores pages other than the app', () => {
        const { handlers, updates } = setup({ version: '0.4.2' }, false);
        expect(handlers[UPDATE_CHANNELS.pending]({})).toBeNull();
        expect(handlers[UPDATE_CHANNELS.install]({})).toBe(false);
        expect(updates.install).not.toHaveBeenCalled();
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
