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
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('file:openFile', options),
    saveFile: (data: ArrayBuffer, options?: { defaultName?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('file:save', data, options),
    saveTemp: (data: ArrayBuffer, filename: string) => ipcRenderer.invoke('file:saveTemp', data, filename),
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },
});
