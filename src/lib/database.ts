import Database from "better-sqlite3";
import { dirname, isAbsolute, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const globalForDatabase = globalThis as unknown as {
  sqlite?: Database.Database;
};

function resolveDatabasePath() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

export function getDatabase() {
  if (!globalForDatabase.sqlite) {
    const databasePath = resolveDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });
    const sqlite = new Database(databasePath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    globalForDatabase.sqlite = sqlite;
  }

  return globalForDatabase.sqlite;
}
