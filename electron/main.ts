import { app, BrowserWindow, ipcMain, clipboard, dialog, shell } from 'electron';
import { join } from 'path';
import { writeFile, readFile } from 'fs/promises';
import './ipc/db';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const iconPath = app.isPackaged
    ? join(__dirname, '../dist/icon.png')
    : join(app.getAppPath(), 'public/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: '办公室收文管理系统',
    icon: iconPath,
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

ipcMain.handle('file:openFile', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showOpenDialog({
    filters: options?.filters || [{ name: 'Word Documents', extensions: ['docx'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const data = await readFile(result.filePaths[0]);
    return { filePath: result.filePaths[0], data: data.buffer };
  }
  return null;
});

ipcMain.handle('file:save', async (_event, data: ArrayBuffer, options?: { defaultName?: string; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: options?.defaultName,
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (!result.canceled && result.filePath) {
    await writeFile(result.filePath, Buffer.from(data));
    return result.filePath;
  }
  return null;
});

ipcMain.handle('file:saveTemp', async (_event, data: ArrayBuffer, filename: string) => {
  const { writeFile: wf } = await import('fs/promises');
  const { join: jn } = await import('path');
  const { tmpdir } = await import('os');
  const tmpPath = jn(tmpdir(), filename);
  await wf(tmpPath, Buffer.from(data));
  return tmpPath;
});

ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
  return shell.openPath(filePath);
});
