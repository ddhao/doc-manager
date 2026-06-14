/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    db: {
      run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowId: number | bigint }>;
      all: (sql: string, params?: any[]) => Promise<any[]>;
      get: (sql: string, params?: any[]) => Promise<any>;
      export: () => Promise<{ success: boolean; path?: string }>;
      import: () => Promise<{ success: boolean; error?: string }>;
      autoBackup: () => Promise<{ success: boolean; path: string }>;
      openBackupDir: () => Promise<void>;
    };
    clipboard: {
      writeText: (text: string) => Promise<void>;
    };
    print: {
      printPDF: (content: string) => Promise<void>;
    };
    file: {
      openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ filePath: string; data: ArrayBuffer } | null>;
      saveFile: (data: ArrayBuffer, options?: { defaultName?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
      saveTemp: (data: ArrayBuffer, filename: string) => Promise<string>;
    };
    shell: {
      openPath: (filePath: string) => Promise<string>;
    };
  };
}
