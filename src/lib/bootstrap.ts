import { getDatabase } from "./database";

let ready = false;

export function ensureDatabase() {
  if (!ready) {
    createTables();
    ready = true;
  }
}

function createTables() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS "ImportBatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "source" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "Cluster" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "server" TEXT NOT NULL,
      "insecure" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "Cluster_name_key" ON "Cluster"("name");

    CREATE TABLE IF NOT EXISTS "Credential" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "authType" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "Credential_name_key" ON "Credential"("name");

    CREATE TABLE IF NOT EXISTS "KubeContext" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "namespace" TEXT NOT NULL DEFAULT 'default',
      "environment" TEXT NOT NULL,
      "riskLevel" TEXT NOT NULL,
      "riskReasons" TEXT NOT NULL,
      "owner" TEXT NOT NULL DEFAULT '未分配',
      "clusterId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "KubeContext_name_key" ON "KubeContext"("name");
  `);
}
