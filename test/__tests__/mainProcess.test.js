const {
    UPDATE_CHECK_INTERVAL_MS,
    modrinthUserAgent,
    startAutoUpdates,
    useDevServer,
} = require('../../public/mainProcess');

describe('useDevServer', () => {
    it('uses the dev server only for an unpackaged app started with --dev', () => {
        expect(useDevServer(false, ['electron', '.', '--dev'])).toBe(true);
        expect(useDevServer(false, ['electron', '.'])).toBe(false);
        expect(useDevServer(true, ['Tmods Downloader.exe', '--dev'])).toBe(false);
    });
});

describe('modrinthUserAgent', () => {
    it('adds the TMods User-Agent and keeps the other headers', () => {
        const callback = jest.fn();
        modrinthUserAgent('1.2.3')(
            { requestHeaders: { Accept: 'application/json', 'User-Agent': 'Chrome' } },
            callback,
        );

        expect(callback).toHaveBeenCalledWith({
            requestHeaders: {
                Accept: 'application/json',
                'User-Agent': 'Trino11/TMods-Downloader/1.2.3 (github.com/Trino11/TMods-Downloader)',
            },
        });
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
