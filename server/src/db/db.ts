import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

export type Db = DatabaseSync;

/** Abre (ou cria) o banco e aplica o schema idempotente. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}

/** Migrations idempotentes p/ bancos já existentes (CREATE TABLE IF NOT EXISTS não altera colunas). */
function migrate(db: Db): void {
  ensureColumn(db, 'midia_diaria', 'chegou_cadastro', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'midia_anuncio', 'chegou_cadastro', 'INTEGER NOT NULL DEFAULT 0');
  // 2026-08-07 — UTM do checkout por venda (seção Comercial)
  ensureColumn(db, 'vendas', 'utm_source', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'vendas', 'utm_medium', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'vendas', 'sck', "TEXT NOT NULL DEFAULT ''");
}

/** Adiciona a coluna se ainda não existir (checa PRAGMA table_info). */
function ensureColumn(db: Db, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
