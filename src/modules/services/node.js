// The page reaches Node through Electron's window.require (the window runs with
// nodeIntegration). Every service takes its Node modules from here, so moving them
// behind a preload script later only changes this file. Tests stub window.require.
const nodeRequire = window.require;

export const fs = nodeRequire('fs');
export const os = nodeRequire('os');
export const path = nodeRequire('path');
export const crypto = nodeRequire('crypto');
export const { Buffer } = nodeRequire('buffer');
export const AdmZip = nodeRequire('adm-zip');
// Talks to the main process, for things only it can do (see public/mainProcess.js).
export const { ipcRenderer } = nodeRequire('electron');
