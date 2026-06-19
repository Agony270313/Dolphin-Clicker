const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let clickerProcess = null;
let activeHotkeys = {}; // Mapping of hotkeyString -> clickerId

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.show();
  }
});

// Disable hardware acceleration to match Dolphin Animate V2 style stability
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    title: 'Dolphin Clicker',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    frame: true, // we keep system frame for simplicity and reliability
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true // Enable devTools for inspection
    },
    backgroundColor: '#0f1115',
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  mainWindow.on('close', (e) => {
    // If minimize to tray is enabled (we read this configuration from renderer/localstorage via IPC or config)
    // For simplicity, we can communicate state or let the app hide on close if checked
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Start C# backend process
function startClickerBackend() {
  const exePath = path.join(__dirname, 'clicker.exe').replace('app.asar', 'app.asar.unpacked');
  
  if (!fs.existsSync(exePath)) {
    console.error("Backend executable not found at: " + exePath);
    dialog.showErrorBox(
      "Backend Error",
      "Dolphin Clicker backend (clicker.exe) is missing. Please run compile.bat to build it first."
    );
    return;
  }

  console.log("Spawning clicker backend: " + exePath);
  clickerProcess = spawn(exePath, [], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  clickerProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      console.log("[Backend]:", line);
      
      if (line.startsWith("STAT ")) {
        // STAT <id> <count>
        const parts = line.split(' ');
        if (parts.length >= 3) {
          const id = parts[1];
          const count = parseInt(parts[2], 10);
          if (mainWindow) {
            mainWindow.webContents.send('backend-stat', { id, count });
          }
        }
      } else if (line.startsWith("LIMIT_REACHED ")) {
        // LIMIT_REACHED <id>
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const id = parts[1];
          if (mainWindow) {
            mainWindow.webContents.send('backend-limit-reached', id);
          }
        }
      } else if (line.startsWith("ACK ")) {
        // ACK start <id> etc.
        const parts = line.split(' ');
        if (parts.length >= 3) {
          const statusType = parts[1];
          const id = parts[2];
          if (mainWindow) {
            mainWindow.webContents.send('backend-ack', { type: statusType, id });
          }
        }
      }
    }
  });

  clickerProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    clickerProcess = null;
  });
}

// Global hotkeys helper
function registerGlobalHotkeys(hotkeyConfig) {
  // hotkeyConfig is { clickerId: hotkeyString }
  globalShortcut.unregisterAll();
  activeHotkeys = {};

  for (const [id, hotkey] of Object.entries(hotkeyConfig)) {
    if (!hotkey) continue;
    
    try {
      const registered = globalShortcut.register(hotkey, () => {
        console.log(`Global hotkey triggered: ${hotkey}`);
        if (mainWindow) {
          mainWindow.webContents.send('global-hotkey-triggered', hotkey);
        }
      });

      if (registered) {
        activeHotkeys[hotkey] = id;
        console.log(`Registered hotkey ${hotkey} for ${id}`);
      } else {
        console.warn(`Failed to register hotkey: ${hotkey}`);
        if (mainWindow) {
          mainWindow.webContents.send('hotkey-registration-failed', { id, hotkey });
        }
      }
    } catch (err) {
      console.error(`Error registering hotkey ${hotkey}:`, err);
    }
  }
}

// Setup System Tray
function setupTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) return;

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dolphin Clicker',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Stop All Clickers',
      click: () => {
        if (clickerProcess && !clickerProcess.killed) {
          clickerProcess.stdin.write('stop_all\n');
        }
        if (mainWindow) {
          mainWindow.webContents.send('tray-stop-all');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Dolphin Clicker');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  startClickerBackend();
  setupTray();
});

// IPC communication between Renderer and Main Process
ipcMain.on('backend-command', (event, commandString) => {
  if (clickerProcess && !clickerProcess.killed) {
    clickerProcess.stdin.write(commandString + '\n');
  } else {
    console.error("Backend process is not running. Cannot execute command: " + commandString);
  }
});

ipcMain.on('update-hotkeys', (event, hotkeyConfig) => {
  registerGlobalHotkeys(hotkeyConfig);
});

ipcMain.on('set-minimize-on-close', (event, value) => {
  // renderer settings tell main process how to handle close
});

ipcMain.on('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

// Clean up before exiting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  
  if (clickerProcess) {
    try {
      clickerProcess.stdin.write('exit\n');
      clickerProcess.kill();
    } catch (e) {
      console.error("Error stopping backend process:", e);
    }
  }
});

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
