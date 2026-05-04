const api = () => window.electronAPI;

export const db = {
  run: (sql: string, params?: any[]) => api().db.run(sql, params),
  all: <T = any>(sql: string, params?: any[]) => api().db.all(sql, params) as Promise<T[]>,
  get: <T = any>(sql: string, params?: any[]) => api().db.get(sql, params) as Promise<T>,
};

export function copyToClipboard(text: string) {
  return api().clipboard.writeText(text);
}

export function printPDF(content: string) {
  return api().print.printPDF(content);
}
