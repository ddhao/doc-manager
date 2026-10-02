import { create } from 'zustand';
import { db } from '@/db';

export interface Handler {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

interface HandlerState {
  handlers: Handler[];
  /** 持久化的默认经办人 */
  defaultHandler: string | null;
  /** 本次运行选用的经办人（启动弹窗选择后生效） */
  currentHandler: string | null;

  loadHandlers: () => Promise<void>;
  loadDefaultHandler: () => Promise<void>;
  setDefaultHandler: (name: string) => Promise<void>;
  setCurrentHandler: (name: string | null) => void;
  addHandler: (name: string) => Promise<void>;
  removeHandler: (id: number) => Promise<void>;
}

export const useHandlerStore = create<HandlerState>((set) => ({
  handlers: [],
  defaultHandler: null,
  currentHandler: null,

  loadHandlers: async () => {
    const rows = await db.all<Handler>('SELECT * FROM handlers ORDER BY sort_order, id');
    set({ handlers: rows });
  },
  loadDefaultHandler: async () => {
    const rows = await db.all<{ value: string }>(
      "SELECT value FROM config WHERE key = 'default_handler'"
    );
    set({ defaultHandler: rows[0]?.value || null });
  },
  setDefaultHandler: async (name: string) => {
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('default_handler', ?)", [name]);
    set({ defaultHandler: name, currentHandler: name });
  },
  setCurrentHandler: (name) => set({ currentHandler: name }),
  addHandler: async (name: string) => {
    await db.run('INSERT INTO handlers (name) VALUES (?)', [name]);
    await useHandlerStore.getState().loadHandlers();
  },
  removeHandler: async (id: number) => {
    await db.run('DELETE FROM handlers WHERE id = ?', [id]);
    set((s) => ({ handlers: s.handlers.filter((h) => h.id !== id) }));
  },
}));
