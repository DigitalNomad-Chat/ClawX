const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// Disable GPU acceleration to prevent renderer white-screen on some macOS configs
app.disableHardwareAcceleration();
const {
  generateLicense,
  loadPrivateKey,
  loadDatabase,
  addLicenseRecord,
} = require('./lib/license-generator');

// Project root is two levels up from tools/license-admin/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'ClawX License Admin',
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
ipcMain.handle('license:generate', async (_event, data) => {
  try {
    const { machineCode, days, edition, note } = data;
    const privateKeyPem = loadPrivateKey(PROJECT_ROOT);
    const result = generateLicense(privateKeyPem, machineCode, days, edition);

    const record = {
      uid: result.serial,
      machine: machineCode,
      edition,
      days,
      expiryDays: result.expiryDays,
      note: note || '',
      createdAt: new Date().toISOString(),
      license: result.license,
    };

    addLicenseRecord(PROJECT_ROOT, record);

    return { success: true, license: result.license, record };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('license:list', async () => {
  try {
    const records = loadDatabase(PROJECT_ROOT);
    return { success: true, records };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('license:copy', async (_event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return { success: true };
});

ipcMain.handle('license:export', async () => {
  try {
    const records = loadDatabase(PROJECT_ROOT);
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `clawx-licenses-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      require('fs').writeFileSync(result.filePath, JSON.stringify(records, null, 2), 'utf8');
      return { success: true };
    }
    return { success: false, error: 'Canceled' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
