import { app, BrowserWindow, ipcMain, clipboard, dialog } from 'electron';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import './ipc/db';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: '办公室收文管理系统',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('clipboard:write', (_event, text: string) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('print:pdf', async (_event, _content: string) => {
  if (mainWindow) {
    const data = await mainWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    return data;
  }
  return null;
});

ipcMain.handle('file:save', async (_event, data: ArrayBuffer) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (!result.canceled && result.filePath) {
    await writeFile(result.filePath, Buffer.from(data));
    return result.filePath;
  }
  return null;
});
