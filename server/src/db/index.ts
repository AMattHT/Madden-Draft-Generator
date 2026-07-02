import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CACHE_DB } from '../config/paths';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(CACHE_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, 'schema.sql');
  // In dev (tsx) schema.sql sits next to this .ts; in build we copy it next to .js.
  const schema = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, 'utf8')
    : fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}
