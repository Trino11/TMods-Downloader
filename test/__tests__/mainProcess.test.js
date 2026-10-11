const {
    CONTENT_SECURITY_POLICY,
    DEV_SERVER_URL,
    UPDATE_CHECK_INTERVAL_MS,
    externalLinkHandler,
    isAppUrl,
    canAutoUpdate,
    startAutoUpdates,
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
        return { on: jest.fn(), checkForUpdatesAndNotify: jest.fn(() => result) };
    }

    it('checks right away and then on a schedule', () => {
        const updater = fakeUpdater(Promise.resolve());
        const schedule = jest.fn();

        startAutoUpdates(updater, { error: jest.fn() }, schedule);

        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
        expect(schedule).toHaveBeenCalledWith(expect.any(Function), UPDATE_CHECK_INTERVAL_MS);
        schedule.mock.calls[0][0]();
        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(2);
    });

    it('logs a failed check instead of crashing', async () => {
        const failure = new Error('offline');
        const updater = fakeUpdater(Promise.reject(failure));
        const log = { error: jest.fn() };

        startAutoUpdates(updater, log, jest.fn());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(log.error).toHaveBeenCalledWith('Update check failed:', failure);
        expect(updater.logger).toBe(log);
    });

    it('logs updater errors', () => {
        const updater = fakeUpdater(Promise.resolve());
        const log = { error: jest.fn() };

        startAutoUpdates(updater, log, jest.fn());
        const [event, listener] = updater.on.mock.calls[0];
        listener(new Error('bad signature'));

        expect(event).toBe('error');
        expect(log.error).toHaveBeenCalledWith('Auto-update failed:', expect.any(Error));
    });
});

describe('canAutoUpdate', () => {
    test('updates on Windows and Linux but not on the unsigned Mac build', () => {
        expect(canAutoUpdate('win32')).toBe(true);
        expect(canAutoUpdate('linux')).toBe(true);
        expect(canAutoUpdate('darwin')).toBe(false);
    });
});
