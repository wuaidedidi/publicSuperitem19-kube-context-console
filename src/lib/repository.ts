import type { ImportResult, ParsedContext } from "./types";
import { ensureDatabase } from "./bootstrap";
import { getDatabase } from "./database";

type ClusterRow = {
  id: string;
  name: string;
  server: string;
  insecure: number;
};

type CredentialRow = {
  id: string;
  name: string;
  authType: string;
};

type ContextJoinRow = {
  id: string;
  name: string;
  namespace: string;
  environment: string;
  riskLevel: string;
  riskReasons: string;
  owner: string;
  clusterName: string;
  clusterServer: string;
  clusterInsecure: number;
  credentialName: string;
  credentialAuthType: string;
};

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapContext(row: ContextJoinRow) {
  return {
    id: row.id,
    name: row.name,
    namespace: row.namespace,
    environment: row.environment,
    riskLevel: row.riskLevel,
    riskReasons: row.riskReasons,
    owner: row.owner,
    cluster: {
      name: row.clusterName,
      server: row.clusterServer,
      insecure: Boolean(row.clusterInsecure)
    },
    credential: {
      name: row.credentialName,
      authType: row.credentialAuthType
    }
  };
}

export async function saveImportResult(result: ImportResult) {
  ensureDatabase();
  const db = getDatabase();
  const run = db.transaction(() => {
    const batchId = createId("batch");
    db.prepare('INSERT INTO "ImportBatch" ("id", "source", "summary") VALUES (?, ?, ?)').run(
      batchId,
      result.source,
      result.summary
    );

    for (const context of result.contexts) {
      upsertContext(batchId, context);
    }

    const contexts = db
      .prepare(
        `
        SELECT kc.id, kc.name, kc.namespace, kc.environment, kc.riskLevel, kc.riskReasons, kc.owner,
               c.name AS clusterName, c.server AS clusterServer, c.insecure AS clusterInsecure,
               u.name AS credentialName, u.authType AS credentialAuthType
        FROM "KubeContext" kc
        JOIN "Cluster" c ON c.id = kc.clusterId
        JOIN "Credential" u ON u.id = kc.userId
        WHERE kc.batchId = ?
        ORDER BY kc.updatedAt DESC
      `
      )
      .all(batchId) as ContextJoinRow[];

    return {
      id: batchId,
      source: result.source,
      summary: result.summary,
      contexts: contexts.map(mapContext)
    };
  });

  return run();
}

function upsertContext(batchId: string, context: ParsedContext) {
  const db = getDatabase();
  const cluster = upsertCluster(context);
  const credential = upsertCredential(context);
  const existing = db
    .prepare('SELECT "id" FROM "KubeContext" WHERE "name" = ?')
    .get(context.name) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `
      UPDATE "KubeContext"
      SET "namespace" = ?, "environment" = ?, "riskLevel" = ?, "riskReasons" = ?,
          "clusterId" = ?, "userId" = ?, "batchId" = ?, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ?
    `
    ).run(
      context.namespace,
      context.environment,
      context.riskLevel,
      context.riskReasons.join("；"),
      cluster.id,
      credential.id,
      batchId,
      existing.id
    );
    return;
  }

  db.prepare(
    `
    INSERT INTO "KubeContext"
      ("id", "name", "namespace", "environment", "riskLevel", "riskReasons", "clusterId", "userId", "batchId", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `
  ).run(
    createId("ctx"),
    context.name,
    context.namespace,
    context.environment,
    context.riskLevel,
    context.riskReasons.join("；"),
    cluster.id,
    credential.id,
    batchId
  );
}

function upsertCluster(context: ParsedContext) {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT "id", "name", "server", "insecure" FROM "Cluster" WHERE "name" = ?')
    .get(context.clusterName) as ClusterRow | undefined;
  if (existing) {
    db.prepare('UPDATE "Cluster" SET "server" = ?, "insecure" = ? WHERE "id" = ?').run(
      context.clusterServer,
      context.clusterInsecure ? 1 : 0,
      existing.id
    );
    return { ...existing, server: context.clusterServer, insecure: context.clusterInsecure ? 1 : 0 };
  }

  const cluster = {
    id: createId("cluster"),
    name: context.clusterName,
    server: context.clusterServer,
    insecure: context.clusterInsecure ? 1 : 0
  };
  db.prepare('INSERT INTO "Cluster" ("id", "name", "server", "insecure") VALUES (?, ?, ?, ?)').run(
    cluster.id,
    cluster.name,
    cluster.server,
    cluster.insecure
  );
  return cluster;
}

function upsertCredential(context: ParsedContext) {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT "id", "name", "authType" FROM "Credential" WHERE "name" = ?')
    .get(context.userName) as CredentialRow | undefined;
  if (existing) {
    db.prepare('UPDATE "Credential" SET "authType" = ? WHERE "id" = ?').run(context.authType, existing.id);
    return { ...existing, authType: context.authType };
  }

  const credential = {
    id: createId("cred"),
    name: context.userName,
    authType: context.authType
  };
  db.prepare('INSERT INTO "Credential" ("id", "name", "authType") VALUES (?, ?, ?)').run(
    credential.id,
    credential.name,
    credential.authType
  );
  return credential;
}

export async function listContexts(query?: string, riskLevel?: string) {
  ensureDatabase();
  const db = getDatabase();
  const where: string[] = [];
  const params: string[] = [];

  if (query) {
    where.push(
      '(kc.name LIKE ? OR kc.namespace LIKE ? OR kc.environment LIKE ? OR kc.owner LIKE ?)'
    );
    const like = `%${query}%`;
    params.push(like, like, like, like);
  }
  if (riskLevel) {
    where.push('kc.riskLevel = ?');
    params.push(riskLevel);
  }

  const rows = db
    .prepare(
      `
      SELECT kc.id, kc.name, kc.namespace, kc.environment, kc.riskLevel, kc.riskReasons, kc.owner,
             c.name AS clusterName, c.server AS clusterServer, c.insecure AS clusterInsecure,
             u.name AS credentialName, u.authType AS credentialAuthType
      FROM "KubeContext" kc
      JOIN "Cluster" c ON c.id = kc.clusterId
      JOIN "Credential" u ON u.id = kc.userId
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE kc.riskLevel WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        kc.updatedAt DESC
    `
    )
    .all(...params) as ContextJoinRow[];

  return rows.map(mapContext);
}

export async function getStats() {
  ensureDatabase();
  const rows = getDatabase()
    .prepare('SELECT "riskLevel", "environment" FROM "KubeContext"')
    .all() as Array<{ riskLevel: string; environment: string }>;

  return {
    total: rows.length,
    highRisk: rows.filter((item) => item.riskLevel === "high").length,
    mediumRisk: rows.filter((item) => item.riskLevel === "medium").length,
    lowRisk: rows.filter((item) => item.riskLevel === "low").length,
    prodLike: rows.filter((item) => item.environment === "生产").length
  };
}

export async function updateContext(
  id: string,
  data: {
    namespace?: string;
    owner?: string;
  }
) {
  ensureDatabase();
  const db = getDatabase();
  const current = db.prepare('SELECT "namespace", "owner" FROM "KubeContext" WHERE "id" = ?').get(id) as
    | { namespace: string; owner: string }
    | undefined;

  if (!current) {
    throw new Error("未找到对应 context");
  }

  db.prepare(
    'UPDATE "KubeContext" SET "namespace" = ?, "owner" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?'
  ).run(data.namespace ?? current.namespace, data.owner ?? current.owner, id);

  const row = db
    .prepare(
      `
      SELECT kc.id, kc.name, kc.namespace, kc.environment, kc.riskLevel, kc.riskReasons, kc.owner,
             c.name AS clusterName, c.server AS clusterServer, c.insecure AS clusterInsecure,
             u.name AS credentialName, u.authType AS credentialAuthType
      FROM "KubeContext" kc
      JOIN "Cluster" c ON c.id = kc.clusterId
      JOIN "Credential" u ON u.id = kc.userId
      WHERE kc.id = ?
    `
    )
    .get(id) as ContextJoinRow;

  return mapContext(row);
}
