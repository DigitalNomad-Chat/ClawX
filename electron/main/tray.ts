/**
 * System Tray Management
 * Creates and manages the system tray icon and menu
 */
import { Tray, Menu, BrowserWindow, app, nativeImage, nativeTheme } from 'electron';
import { join } from 'path';

let tray: Tray | null = null;

/**
 * Resolve the icons directory path (works in both dev and packaged mode)
 */
function getIconsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'icons');
  }
  return join(__dirname, '../../resources/icons');
}

/**
 * Resolve the appropriate tray icon path based on platform and system theme
 */
function getTrayIconPath(): string {
  const iconsDir = getIconsDir();

  if (process.platform === 'win32') {
    return join(iconsDir, 'icon.ico');
  } else if (process.platform === 'darwin') {
    // macOS: auto-switch between colored (light mode) and white (dark mode)
    const isDark = nativeTheme.shouldUseDarkColors;
    return join(iconsDir, isDark ? 'tray-icon-dark.png' : 'tray-icon.png');
  }
  // Linux
  return join(iconsDir, '32x32.png');
}

/**
 * Update tray icon when system theme changes (macOS only)
 */
function updateTrayIcon(): void {
  if (!tray || process.platform !== 'darwin') return;

  const iconPath = getTrayIconPath();
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(join(getIconsDir(), 'icon.png'));
  }
  tray.setImage(icon);
}

/**
 * Create system tray icon and menu
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  const iconsDir = getIconsDir();
  const iconPath = getTrayIconPath();

  let icon = nativeImage.createFromPath(iconPath);

  // Fallback to icon.png if platform-specific icon not found
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(join(iconsDir, 'icon.png'));
  }

  tray = new Tray(icon);

  // macOS: listen for system theme changes to swap tray icon
  if (process.platform === 'darwin') {
    nativeTheme.on('updated', updateTrayIcon);
  }
  
  // Set tooltip
  tray.setToolTip('ClawDock - AI Assistant');
  
  const showWindow = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  };

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show ClawDock',
      click: showWindow,
    },
    {
      type: 'separator',
    },
    {
      label: 'Gateway Status',
      enabled: false,
    },
    {
      label: '  Running',
      type: 'checkbox',
      checked: true,
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: 'Quick Actions',
      submenu: [
        {
          label: 'Open Chat',
          click: () => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.show();
            mainWindow.webContents.send('navigate', '/');
          },
        },
        {
          label: 'Open Settings',
          click: () => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.show();
            mainWindow.webContents.send('navigate', '/settings');
          },
        },
      ],
    },
    {
      type: 'separator',
    },
    {
      label: 'Check for Updates...',
      click: () => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('update:check');
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit ClawDock',
      click: () => {
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click to show window (Windows/Linux)
  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // Double-click to show window (Windows)
  tray.on('double-click', () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  
  return tray;
}

/**
 * Update tray tooltip with Gateway status
 */
export function updateTrayStatus(status: string): void {
  if (tray) {
    tray.setToolTip(`ClawDock - ${status}`);
  }
}

/**
 * Destroy tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
