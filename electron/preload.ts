import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    run: (sql: string, params?: any[]) => ipcRenderer.invoke('db:run', sql, params),
    all: (sql: string, params?: any[]) => ipcRenderer.invoke('db:all', sql, params),
    get: (sql: string, params?: any[]) => ipcRenderer.invoke('db:get', sql, params),
    export: () => ipcRenderer.invoke('db:export'),
    import: () => ipcRenderer.invoke('db:import'),
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  },
  print: {
    printPDF: (content: string) => ipcRenderer.invoke('print:pdf', content),
  },
  file: {
    saveFile: (data: ArrayBuffer) => ipcRenderer.invoke('file:save', data),
  },
});
