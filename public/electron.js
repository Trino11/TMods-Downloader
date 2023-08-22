#!/usr/bin/env node

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.info('Hello, log')

let mainWindow;

// const isDev = process.env.NODE_ENV !== 'production';
const isDev = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      webSecurity: false  // Disables CORS restrictions
    }
  });

  isDev
    ? mainWindow.loadURL('http://localhost:3000')
    :mainWindow.loadFile(path.join(__dirname, './index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.on('app_version', (event) => {
  sendStatusToWindow('Getting App Version....')
  event.sender.send('app_version', { version: app.getVersion() })
})

// autoUpdater.requestHeaders = { 'PRIVATE-TOKEN': 'eFTVsRVwxUeXuB_vWb8s' }
autoUpdater.autoDownload = true
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

sendStatusToWindow(autoUpdater)

autoUpdater.on('update-available', () => {
  sendStatusToWindow('An Update is available....')
  mainWindow.webContents.send('update_available')
})

autoUpdater.on('update-downloaded', () => {
  sendStatusToWindow('Update has been downloaded....')
  mainWindow.webContents.send('update_downloaded')
})

ipcMain.on('restart_app', () => {
  sendStatusToWindow('In onRestart_App')
  autoUpdater.quitAndInstall()
})


autoUpdater.on('checking-for-update', function () {
  sendStatusToWindow('Checking for update...')
})

autoUpdater.on('update-not-available', function (info) {
  sendStatusToWindow('Update not available.')
})

autoUpdater.on('error', function (err) {
  sendStatusToWindow('We have an error in auto-updater: ')
  sendStatusToWindow(String(err))
})

autoUpdater.on('download-progress', function (progressObj) {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond
  log_message =
    log_message + ' - Downloaded ' + parseInt(progressObj.percent) + '%'
  log_message =
    log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')'
  sendStatusToWindow(log_message)
})

// Check for an update 10sec after Program Starts
setTimeout(function () {
  sendStatusToWindow('We are checking for updates and notifying user...')
  autoUpdater.checkForUpdatesAndNotify()
}, 10000)

// Check for an update every 2min.
setInterval(function () {
  sendStatusToWindow('We are checking for updates and notifying user...')
  autoUpdater.checkForUpdatesAndNotify()
}, 120000)

function sendStatusToWindow(message) {
  log.info(message)
}