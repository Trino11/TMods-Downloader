// The page asks the main process over IPC; window.require hands it a fake ipcRenderer.
const invoke = jest.fn();

beforeEach(() => {
    jest.resetModules();
    window.require = name => (name === 'electron' ? { ipcRenderer: { invoke } } : require(name));
});

afterEach(() => {
    delete window.require;
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
