const path = require('path');
const { LOG_CHANNELS, registerLogHandlers } = require('../../public/mainProcess');

const LOG_FILE = path.join('/userData', 'logs', 'main.log');

// Registers the handlers against fakes and returns them by channel.
function setup(existing) {
    const handlers = {};
    const ipcMain = { handle: (channel, handler) => (handlers[channel] = handler) };
    const shell = { openPath: jest.fn(() => Promise.resolve('')), showItemInFolder: jest.fn() };
    const fs = { existsSync: file => existing.includes(file) };
    registerLogHandlers(ipcMain, shell, fs, path, () => LOG_FILE);
    return { handlers, shell };
}

describe('registerLogHandlers', () => {
    it('reports the log path', () => {
        const { handlers } = setup([]);
        expect(handlers[LOG_CHANNELS.getPath]()).toBe(LOG_FILE);
    });

    it('opens the log file in the default app', async () => {
        const { handlers, shell } = setup([LOG_FILE]);
        await expect(handlers[LOG_CHANNELS.openFile]()).resolves.toBe('');
        expect(shell.openPath).toHaveBeenCalledWith(LOG_FILE);
    });

    it('passes on the error when the system cannot open the file', async () => {
        const { handlers, shell } = setup([LOG_FILE]);
        shell.openPath.mockResolvedValue('No application is associated with the file');
        await expect(handlers[LOG_CHANNELS.openFile]()).resolves.toBe('No application is associated with the file');
    });

    it('says so instead of opening a log that does not exist yet', async () => {
        const { handlers, shell } = setup([]);
        await expect(handlers[LOG_CHANNELS.openFile]()).resolves.toMatch('no log file yet');
        expect(shell.openPath).not.toHaveBeenCalled();
    });

    it('shows the log file selected in its folder', async () => {
        const { handlers, shell } = setup([LOG_FILE]);
        await expect(handlers[LOG_CHANNELS.showInFolder]()).resolves.toBe('');
        expect(shell.showItemInFolder).toHaveBeenCalledWith(LOG_FILE);
    });

    it('opens the folder when the file is missing but the folder is there', async () => {
        const folder = path.dirname(LOG_FILE);
        const { handlers, shell } = setup([folder]);
        await expect(handlers[LOG_CHANNELS.showInFolder]()).resolves.toBe('');
        expect(shell.openPath).toHaveBeenCalledWith(folder);
        expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('says so when neither the file nor its folder exist', async () => {
        const { handlers, shell } = setup([]);
        await expect(handlers[LOG_CHANNELS.showInFolder]()).resolves.toMatch('no log folder yet');
        expect(shell.openPath).not.toHaveBeenCalled();
    });
});
