// Runs before the page, in Electron's sandbox: it has no Node, only IPC. It gives the
// page one object, window.tmods, whose calls are forwarded to the main process
// (bridge.js), which decides what is allowed. The page itself never sees ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron');

function call(method, args) {
    const result = ipcRenderer.sendSync('tmods:call', method, args);
    if (!result || 'error' in result) {
        const error = new Error(result ? result.error : `No answer for ${method}`);
        if (result && result.code) {
            error.code = result.code;
        }
        throw error;
    }
    return result.value;
}

// The main process lists its calls, so this file never needs to change when one is added:
// "fs.readFile" becomes window.tmods.fs.readFile(...).
const { methods, ...info } = ipcRenderer.sendSync('tmods:info');
const api = {
    ...info,
    http: request => ipcRenderer.invoke('tmods:http', request),
    // The Settings page's log file buttons (LOG_CHANNELS in mainProcess.js).
    logs: {
        getPath: () => ipcRenderer.invoke('logs:get-path'),
        openFile: () => ipcRenderer.invoke('logs:open-file'),
        showInFolder: () => ipcRenderer.invoke('logs:show-in-folder'),
    },
};
for (const method of methods) {
    const [group, name] = method.split('.');
    api[group] = api[group] || {};
    api[group][name] = (...args) => call(method, args);
}

contextBridge.exposeInMainWorld('tmods', api);
