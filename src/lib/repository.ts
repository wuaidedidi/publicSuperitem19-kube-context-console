import type { Prisma } from "@prisma/client";
import type { ImportResult, ParsedContext } from "./types";
import { prisma } from "./prisma";
import { ensureDatabase } from "./bootstrap";

export async function saveImportResult(result: ImportResult) {
  await ensureDatabase();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const batch = await tx.importBatch.create({
      data: {
        source: result.source,
        summary: result.summary
      }
    });

    for (const context of result.contexts) {
      await upsertContext(tx, batch.id, context);
    }

    return tx.importBatch.findUnique({
      where: { id: batch.id },
      include: { contexts: true }
    });
  });
}

async function upsertContext(
  tx: Prisma.TransactionClient,
  batchId: string,
  context: ParsedContext
) {
  const cluster = await tx.cluster.upsert({
    where: { name: context.clusterName },
    update: {
      server: context.clusterServer,
      insecure: context.clusterInsecure
    },
    create: {
      name: context.clusterName,
      server: context.clusterServer,
      insecure: context.clusterInsecure
    }
  });

  const credential = await tx.credential.upsert({
    where: { name: context.userName },
    update: {
      authType: context.authType
    },
    create: {
      name: context.userName,
      authType: context.authType
    }
  });

  await tx.kubeContext.upsert({
    where: { name: context.name },
    update: {
      namespace: context.namespace,
      environment: context.environment,
      riskLevel: context.riskLevel,
      riskReasons: context.riskReasons.join("；"),
      clusterId: cluster.id,
      userId: credential.id,
      batchId
    },
    create: {
      name: context.name,
      namespace: context.namespace,
      environment: context.environment,
      riskLevel: context.riskLevel,
      riskReasons: context.riskReasons.join("；"),
      clusterId: cluster.id,
      userId: credential.id,
      batchId
    }
  });
}

export async function listContexts(query?: string, riskLevel?: string) {
  await ensureDatabase();
  return prisma.kubeContext.findMany({
    where: {
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { namespace: { contains: query } },
              { environment: { contains: query } },
              { owner: { contains: query } }
            ]
          }
        : {}),
      ...(riskLevel ? { riskLevel } : {})
    },
    include: {
      cluster: true,
      credential: true
    },
    orderBy: [{ riskLevel: "desc" }, { updatedAt: "desc" }]
  });
}

export async function getStats() {
  await ensureDatabase();
  const contexts = (await prisma.kubeContext.findMany()) as Array<{
    riskLevel: string;
    environment: string;
  }>;
  return {
    total: contexts.length,
    highRisk: contexts.filter((item) => item.riskLevel === "high").length,
    mediumRisk: contexts.filter((item) => item.riskLevel === "medium").length,
    lowRisk: contexts.filter((item) => item.riskLevel === "low").length,
    prodLike: contexts.filter((item) => item.environment === "生产").length
  };
}

export async function updateContext(
  id: string,
  data: {
    namespace?: string;
    owner?: string;
  }
) {
  await ensureDatabase();
  return prisma.kubeContext.update({
    where: { id },
    data,
    include: {
      cluster: true,
      credential: true
    }
  });
}
