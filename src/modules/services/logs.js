import { logs } from './node';

// Where the app writes its log.
export function getLogPath() {
    return logs.getPath();
}

// Opens the log in the system's default viewer. Rejects with the reason it couldn't.
export async function openLogFile() {
    const error = await logs.openFile();
    if (error) {
        throw new Error(error);
    }
}

// Opens the folder holding the log, with the file selected.
export async function showLogInFolder() {
    const error = await logs.showInFolder();
    if (error) {
        throw new Error(error);
    }
}
