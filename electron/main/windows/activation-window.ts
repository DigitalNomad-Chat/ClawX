import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { licenseManager } from '../security/license-manager';

let activationWindow: BrowserWindow | null = null;
let onActivationSuccessCallback: (() => void) | null = null;

export function setOnActivationSuccess(callback: () => void) {
  onActivationSuccessCallback = callback;
}

export function createActivationWindow(machineCode: string = '') {
  if (activationWindow) {
    activationWindow.focus();
    return;
  }

  activationWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'ClawX 激活',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    activationWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/activation`);
  } else {
    activationWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      hash: 'activation',
    });
  }

  activationWindow.on('closed', () => {
    activationWindow = null;
  });

  activationWindow.webContents.on('did-finish-load', () => {
    activationWindow?.webContents.send('license:machine-code', machineCode);
  });
}

ipcMain.handle('license:activate', async (_event, licenseCode: string) => {
  const result = licenseManager.activateLicense(licenseCode);
  if (result.success) {
    activationWindow?.close();
    onActivationSuccessCallback?.();
  }
  return result;
});

ipcMain.handle('license:get-machine-code', () => {
  return licenseManager.getMachineFingerprint().displayCode;
});

ipcMain.handle('license:get-machine-factors', () => {
  return licenseManager.getMachineFactors();
});
