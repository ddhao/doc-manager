import { create } from 'zustand';
import { db } from '@/db';

export interface DocLevel {
  id: number;
  name: string;
  sort_order: number;
}

export interface DocType {
  id: number;
  name: string;
}

export interface DocTag {
  id: number;
  name: string;
}

export interface DispatchType {
  id: number;
  name: string;
}

export interface ApplicationType {
  id: number;
  name: string;
}

interface ConfigState {
  levels: DocLevel[];
  docTypes: DocType[];
  tags: DocTag[];
  dispatchTypes: DispatchType[];
  appTypes: ApplicationType[];
  loading: boolean;

  loadLevels: () => Promise<void>;
  addLevel: (name: string) => Promise<void>;
  removeLevel: (id: number) => Promise<void>;

  loadDocTypes: () => Promise<void>;
  addDocType: (name: string) => Promise<void>;
  removeDocType: (id: number) => Promise<void>;

  loadTags: () => Promise<void>;
  addTag: (name: string) => Promise<void>;
  removeTag: (id: number) => Promise<void>;

  loadDispatchTypes: () => Promise<void>;
  addDispatchType: (name: string) => Promise<void>;
  removeDispatchType: (id: number) => Promise<void>;

  loadAppTypes: () => Promise<void>;
  addAppType: (name: string) => Promise<void>;
  removeAppType: (id: number) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  levels: [],
  docTypes: [],
  tags: [],
  dispatchTypes: [],
  appTypes: [],
  loading: false,

  loadLevels: async () => {
    const rows = await db.all<DocLevel>('SELECT * FROM document_levels ORDER BY sort_order');
    set({ levels: rows });
  },
  addLevel: async (name: string) => {
    await db.run('INSERT OR IGNORE INTO document_levels (name) VALUES (?)', [name]);
    await useConfigStore.getState().loadLevels();
  },
  removeLevel: async (id: number) => {
    await db.run('DELETE FROM document_levels WHERE id = ?', [id]);
    set((s) => ({ levels: s.levels.filter((l) => l.id !== id) }));
  },

  loadDocTypes: async () => {
    const rows = await db.all<DocType>('SELECT * FROM document_types ORDER BY id');
    set({ docTypes: rows });
  },
  addDocType: async (name: string) => {
    await db.run('INSERT OR IGNORE INTO document_types (name) VALUES (?)', [name]);
    await useConfigStore.getState().loadDocTypes();
  },
  removeDocType: async (id: number) => {
    await db.run('DELETE FROM document_types WHERE id = ?', [id]);
    set((s) => ({ docTypes: s.docTypes.filter((t) => t.id !== id) }));
  },

  loadTags: async () => {
    const rows = await db.all<DocTag>('SELECT * FROM document_tags ORDER BY id');
    set({ tags: rows });
  },
  addTag: async (name: string) => {
    await db.run('INSERT OR IGNORE INTO document_tags (name) VALUES (?)', [name]);
    await useConfigStore.getState().loadTags();
  },
  removeTag: async (id: number) => {
    await db.run('DELETE FROM document_tags WHERE id = ?', [id]);
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
  },

  loadDispatchTypes: async () => {
    const rows = await db.all<DispatchType>('SELECT * FROM dispatch_types ORDER BY id');
    set({ dispatchTypes: rows });
  },
  addDispatchType: async (name: string) => {
    await db.run('INSERT OR IGNORE INTO dispatch_types (name) VALUES (?)', [name]);
    await useConfigStore.getState().loadDispatchTypes();
  },
  removeDispatchType: async (id: number) => {
    await db.run('DELETE FROM dispatch_types WHERE id = ?', [id]);
    set((s) => ({ dispatchTypes: s.dispatchTypes.filter((t) => t.id !== id) }));
  },

  loadAppTypes: async () => {
    const rows = await db.all<ApplicationType>('SELECT * FROM application_types ORDER BY id');
    set({ appTypes: rows });
  },
  addAppType: async (name: string) => {
    await db.run('INSERT OR IGNORE INTO application_types (name) VALUES (?)', [name]);
    await useConfigStore.getState().loadAppTypes();
  },
  removeAppType: async (id: number) => {
    await db.run('DELETE FROM application_types WHERE id = ?', [id]);
    set((s) => ({ appTypes: s.appTypes.filter((t) => t.id !== id) }));
  },
}));
