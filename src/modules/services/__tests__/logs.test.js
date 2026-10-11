// The page asks the main process through the preload's window.tmods.logs; this fake
// records which IPC channel each call would use, as the preload does.
const invoke = jest.fn();

beforeEach(() => {
    jest.resetModules();
    window.tmods = {
        logs: {
            getPath: () => invoke('logs:get-path'),
            openFile: () => invoke('logs:open-file'),
            showInFolder: () => invoke('logs:show-in-folder'),
        },
    };
});

afterEach(() => {
    delete window.tmods;
});

function load() {
    return require('../logs');
}

it('asks the main process for the log path', async () => {
    invoke.mockResolvedValue('/logs/main.log');
    await expect(load().getLogPath()).resolves.toBe('/logs/main.log');
    expect(invoke).toHaveBeenCalledWith('logs:get-path');
});

it('opens the log file and the folder', async () => {
    invoke.mockResolvedValue('');
    const { openLogFile, showLogInFolder } = load();
    await openLogFile();
    await showLogInFolder();
    expect(invoke).toHaveBeenCalledWith('logs:open-file');
    expect(invoke).toHaveBeenCalledWith('logs:show-in-folder');
});

it('rejects with the reason the main process gives', async () => {
    invoke.mockResolvedValue('There is no log file yet.');
    await expect(load().openLogFile()).rejects.toThrow('There is no log file yet.');
});
