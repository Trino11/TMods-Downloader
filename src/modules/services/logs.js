import { ipcRenderer } from './node';

// Mirrors LOG_CHANNELS in public/mainProcess.js, which handles them.
const LOG_CHANNELS = {
    getPath: 'logs:get-path',
    openFile: 'logs:open-file',
    showInFolder: 'logs:show-in-folder',
};

// Where the app writes its log.
export function getLogPath() {
    return ipcRenderer.invoke(LOG_CHANNELS.getPath);
}

// Opens the log in the system's default viewer. Rejects with the reason it couldn't.
export async function openLogFile() {
    const error = await ipcRenderer.invoke(LOG_CHANNELS.openFile);
    if (error) {
        throw new Error(error);
    }
}

// Opens the folder holding the log, with the file selected.
export async function showLogInFolder() {
    const error = await ipcRenderer.invoke(LOG_CHANNELS.showInFolder);
    if (error) {
        throw new Error(error);
    }
}
