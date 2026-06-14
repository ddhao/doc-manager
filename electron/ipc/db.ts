import { ipcMain, dialog, shell } from 'electron';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { copyFile, mkdir } from 'fs/promises';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'doc-manager.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit_id INTEGER,
      leader TEXT,
      receiver TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      alias TEXT,
      title TEXT,
      phone TEXT,
      department_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dispatch_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incoming_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_type TEXT,
      document_tag TEXT,
      send_unit_id INTEGER,
      title TEXT NOT NULL,
      summary TEXT,
      approval_number TEXT,
      forward_department_id INTEGER,
      reply_deadline TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (send_unit_id) REFERENCES units(id) ON DELETE SET NULL,
      FOREIGN KEY (forward_department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS incoming_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incoming_doc_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (incoming_doc_id) REFERENCES incoming_docs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incoming_doc_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incoming_doc_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('lead','assist','summary','read_handle','read_notify')),
      FOREIGN KEY (incoming_doc_id) REFERENCES incoming_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      UNIQUE(incoming_doc_id, department_id)
    );

    CREATE TABLE IF NOT EXISTS outgoing_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      level TEXT,
      reply_deadline TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outgoing_doc_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outgoing_doc_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      is_read INTEGER DEFAULT 0,
      FOREIGN KEY (outgoing_doc_id) REFERENCES outgoing_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      UNIQUE(outgoing_doc_id, unit_id)
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      meeting_time TEXT,
      location TEXT,
      notification_template TEXT,
      notes TEXT,
      leaders TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meeting_attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(meeting_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS meeting_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS archive_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      box_number TEXT NOT NULL UNIQUE,
      box_type TEXT NOT NULL CHECK(box_type IN ('incoming','reply','outgoing')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS archive_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_box_id INTEGER NOT NULL,
      archive_number INTEGER,
      doc_type TEXT NOT NULL,
      doc_id INTEGER NOT NULL,
      reply_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (archive_box_id) REFERENCES archive_boxes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS periodic_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      reminder_day INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      has_approvers INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_approvers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id INTEGER NOT NULL,
      approver_name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (stage_id) REFERENCES workflow_stages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      applicant TEXT,
      workflow_template_id INTEGER,
      current_stage_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (type_id) REFERENCES application_types(id),
      FOREIGN KEY (workflow_template_id) REFERENCES workflow_templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      stage_order INTEGER DEFAULT 0,
      stage_name TEXT,
      approver_name TEXT,
      status TEXT DEFAULT 'pending',
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );
  `);

  // Migration: add document_tag column for existing databases
  try {
    db.exec(`ALTER TABLE incoming_docs ADD COLUMN document_tag TEXT`);
  } catch { /* column already exists */ }

  // Migration: add level column for existing databases
  try {
    db.exec(`ALTER TABLE incoming_docs ADD COLUMN level TEXT`);
  } catch { /* column already exists */ }

  // Migration: create outgoing_doc_units junction table and migrate existing data
  db.exec(`
    CREATE TABLE IF NOT EXISTS outgoing_doc_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outgoing_doc_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      is_read INTEGER DEFAULT 0,
      FOREIGN KEY (outgoing_doc_id) REFERENCES outgoing_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      UNIQUE(outgoing_doc_id, unit_id)
    )
  `);
  const migrateCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM outgoing_doc_units"
  ).get() as { cnt: number };
  if (migrateCount.cnt === 0) {
    try {
      db.exec(`
        INSERT OR IGNORE INTO outgoing_doc_units (outgoing_doc_id, unit_id)
        SELECT id, send_unit_id FROM outgoing_docs WHERE send_unit_id IS NOT NULL
      `);
    } catch { /* column might not exist */ }
  }

  // Migration: add is_read column to outgoing_doc_units
  try {
    db.exec(`ALTER TABLE outgoing_doc_units ADD COLUMN is_read INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  // Migration: add notes column to meetings
  try {
    db.exec(`ALTER TABLE meetings ADD COLUMN notes TEXT`);
  } catch { /* column already exists */ }

  // Migration: add leaders column to meetings
  try {
    db.exec(`ALTER TABLE meetings ADD COLUMN leaders TEXT`);
  } catch { /* column already exists */ }

  // Migration: add meeting_time_end column to meetings
  try {
    db.exec(`ALTER TABLE meetings ADD COLUMN meeting_time_end TEXT`);
  } catch { /* column already exists */ }

  // Migration: add reply_date column to incoming_docs
  try {
    db.exec(`ALTER TABLE incoming_docs ADD COLUMN reply_date TEXT`);
  } catch { /* column already exists */ }

  // Migration: add notes column to incoming_docs
  try {
    db.exec(`ALTER TABLE incoming_docs ADD COLUMN notes TEXT`);
  } catch { /* column already exists */ }

  // One-time: clear all meeting data for schema upgrade
  const meetingCleared = db.prepare(
    "SELECT value FROM config WHERE key = 'meeting_data_cleared_v2'"
  ).get() as { value: string } | undefined;
  if (!meetingCleared) {
    db.exec(`
      DELETE FROM meeting_files;
      DELETE FROM meeting_attendees;
      DELETE FROM meetings;
    `);
    db.prepare(
      "INSERT OR REPLACE INTO config (key, value) VALUES ('meeting_data_cleared_v2', '1')"
    ).run();
  }

  // Migration: add alias column to contacts
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN alias TEXT`);
  } catch { /* column already exists */ }

  // Migration: add sort_order column to departments
  try {
    db.exec(`ALTER TABLE departments ADD COLUMN sort_order INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }

  // Migration: add role-based department assignment table
  db.exec(`
    CREATE TABLE IF NOT EXISTS incoming_doc_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incoming_doc_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('lead','assist','summary','read_handle','read_notify')),
      FOREIGN KEY (incoming_doc_id) REFERENCES incoming_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      UNIQUE(incoming_doc_id, department_id)
    )
  `);

  // Migration: update incoming_doc_departments CHECK constraint to include read_notify
  const roles = ['lead', 'assist', 'summary', 'read_handle', 'read_notify'];
  const roleList = roles.map((r) => `'${r}'`).join(',');
  const checkDef = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='incoming_doc_departments'"
  ).get() as { sql: string } | undefined;
  if (checkDef && !checkDef.sql.includes('read_notify')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _idd_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incoming_doc_id INTEGER NOT NULL,
        department_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN (${roleList})),
        FOREIGN KEY (incoming_doc_id) REFERENCES incoming_docs(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        UNIQUE(incoming_doc_id, department_id)
      );
      INSERT INTO _idd_new SELECT * FROM incoming_doc_departments;
      DROP TABLE incoming_doc_departments;
      ALTER TABLE _idd_new RENAME TO incoming_doc_departments;
    `);
  }

  // Migration: add columns for approval form fields
  try { db.exec(`ALTER TABLE incoming_docs ADD COLUMN document_number TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE incoming_docs ADD COLUMN security_level TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE incoming_docs ADD COLUMN handler TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE incoming_docs ADD COLUMN reviewer TEXT`); } catch { /* exists */ }

  // Migration: workflow_stages schema v2 — replace stage_type enum with user-defined name + has_approvers flag
  try {
    const colInfo = db.prepare("PRAGMA table_info('workflow_stages')").all() as { name: string }[];
    const colNames = colInfo.map((c) => c.name);
    if (colNames.includes('stage_type') && !colNames.includes('has_approvers')) {
      db.exec(`
        DROP TABLE IF EXISTS workflow_approvers;
        DROP TABLE IF EXISTS workflow_stages;
        DROP TABLE IF EXISTS workflow_templates;
      `);
      // Recreate with new schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS workflow_stages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          has_approvers INTEGER DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workflow_approvers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stage_id INTEGER NOT NULL,
          approver_name TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0,
          FOREIGN KEY (stage_id) REFERENCES workflow_stages(id) ON DELETE CASCADE
        );
      `);
    }
  } catch { /* tables don't exist yet */ }

  seedDefaults(db);
}

function seedDefaults(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM document_levels').get() as any;
  if (count.cnt === 0) {
    const levels = ['特急', '加急', '急', '平'];
    const stmt = db.prepare('INSERT OR IGNORE INTO document_levels (name, sort_order) VALUES (?, ?)');
    levels.forEach((l, i) => stmt.run(l, i));

    const types = ['镇府公文', '市局公文', '政府工单'];
    const typeStmt = db.prepare('INSERT OR IGNORE INTO document_types (name) VALUES (?)');
    types.forEach((t) => typeStmt.run(t));

    const dispatchTypes = ['报告', '情况说明', '会议纪要', '分局动态', '征求意见稿'];
    const dStmt = db.prepare('INSERT OR IGNORE INTO dispatch_types (name) VALUES (?)');
    dispatchTypes.forEach((t) => dStmt.run(t));

    const appTypes = ['发文申请', '公章申请'];
    const atStmt = db.prepare('INSERT OR IGNORE INTO application_types (name) VALUES (?)');
    appTypes.forEach((t) => atStmt.run(t));
  }
}

ipcMain.handle('db:run', (_event, sql: string, params?: any[]) => {
  const database = getDb();
  const stmt = database.prepare(sql);
  const result = stmt.run(...(params || []));
  return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
});

ipcMain.handle('db:all', (_event, sql: string, params?: any[]) => {
  const database = getDb();
  return database.prepare(sql).all(...(params || []));
});

ipcMain.handle('db:get', (_event, sql: string, params?: any[]) => {
  const database = getDb();
  return database.prepare(sql).get(...(params || []));
});

ipcMain.handle('db:autoBackup', async () => {
  const userData = app.getPath('userData');
  const dbPath = join(userData, 'doc-manager.db');
  const backupDir = join(userData, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(backupDir, `auto-backup-${timestamp}.db`);

  await mkdir(backupDir, { recursive: true });
  const database = getDb();
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.close();
  db = null;
  await copyFile(dbPath, backupPath);
  getDb();
  return { success: true, path: backupPath };
});

ipcMain.handle('db:openBackupDir', async () => {
  const backupDir = join(app.getPath('userData'), 'backups');
  await mkdir(backupDir, { recursive: true });
  await shell.openPath(backupDir);
});

ipcMain.handle('db:export', async () => {
  const dbPath = join(app.getPath('userData'), 'doc-manager.db');
  const result = await dialog.showSaveDialog({
    defaultPath: `doc-manager-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (!result.canceled && result.filePath) {
    const database = getDb();
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
    db = null;
    await copyFile(dbPath, result.filePath);
    getDb();
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('db:import', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const sourcePath = result.filePaths[0];
  const dbPath = join(app.getPath('userData'), 'doc-manager.db');

  try {
    // Validate that the selected file is a valid SQLite database
    const testDb = new Database(sourcePath, { readonly: true });
    testDb.close();
  } catch {
    return { success: false, error: '所选文件不是有效的数据库文件' };
  }

  // Backup current database before replacing
  const backupPath = `${dbPath}.before-import.bak`;
  const database = getDb();
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.close();
  db = null;
  await copyFile(dbPath, backupPath);

  try {
    await copyFile(sourcePath, dbPath);
    getDb();
    return { success: true };
  } catch (e: any) {
    // Restore from backup if import fails
    await copyFile(backupPath, dbPath);
    getDb();
    return { success: false, error: e.message || '导入失败，已恢复原数据' };
  }
});
