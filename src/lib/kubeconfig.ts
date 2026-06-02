import yaml from "js-yaml";
import { z } from "zod";
import type { ImportResult, ParsedContext, RawKubeConfig } from "./types";

const inputSchema = z.object({
  source: z.string().trim().min(1).default("手工导入"),
  content: z.string().trim().min(20, "kubeconfig 内容过短")
});

const prodPattern = /(prod|production|prd|live|线上|生产)/i;
const stagingPattern = /(stage|staging|预发|uat)/i;
const devPattern = /(dev|test|qa|sandbox|local|kind|minikube)/i;

export function parseImportInput(input: unknown): ImportResult {
  const data = inputSchema.parse(input);
  return parseKubeConfig(data.content, data.source);
}

export function parseKubeConfig(content: string, source = "手工导入"): ImportResult {
  const doc = yaml.load(content) as RawKubeConfig | null;
  if (!doc || typeof doc !== "object") {
    throw new Error("无法读取 kubeconfig YAML");
  }

  const contexts = Array.isArray(doc.contexts) ? doc.contexts : [];
  const clusters = new Map((doc.clusters ?? []).map((item) => [item.name, item]));
  const users = new Map((doc.users ?? []).map((item) => [item.name, item]));

  const parsed = contexts
    .map((item) => toParsedContext(item, clusters, users))
    .filter((item): item is ParsedContext => item !== null);

  if (parsed.length === 0) {
    throw new Error("没有发现可导入的 context");
  }

  const highRiskCount = parsed.filter((item) => item.riskLevel === "high").length;
  return {
    source,
    summary: `导入 ${parsed.length} 个 context，其中 ${highRiskCount} 个需要优先复核`,
    contexts: parsed
  };
}

function toParsedContext(
  item: NonNullable<RawKubeConfig["contexts"]>[number],
  clusters: Map<string | undefined, NonNullable<RawKubeConfig["clusters"]>[number]>,
  users: Map<string | undefined, NonNullable<RawKubeConfig["users"]>[number]>
): ParsedContext | null {
  if (!item.name || !item.context?.cluster || !item.context?.user) {
    return null;
  }
  const cluster = clusters.get(item.context.cluster);
  const user = users.get(item.context.user);
  const clusterServer = cluster?.cluster?.server ?? "";
  const authType = detectAuthType(user?.user ?? {});
  const environment = detectEnvironment(item.name, item.context.namespace, clusterServer);
  const riskReasons = getRiskReasons({
    name: item.name,
    namespace: item.context.namespace ?? "default",
    environment,
    clusterServer,
    clusterInsecure: Boolean(cluster?.cluster?.["insecure-skip-tls-verify"]),
    authType
  });

  return {
    name: item.name,
    namespace: item.context.namespace ?? "default",
    environment,
    clusterName: item.context.cluster,
    clusterServer,
    clusterInsecure: Boolean(cluster?.cluster?.["insecure-skip-tls-verify"]),
    userName: item.context.user,
    authType,
    riskLevel: riskReasons.length >= 2 ? "high" : riskReasons.length === 1 ? "medium" : "low",
    riskReasons
  };
}

function detectEnvironment(name: string, namespace = "", server = "") {
  const text = `${name} ${namespace} ${server}`;
  if (prodPattern.test(text)) return "生产";
  if (stagingPattern.test(text)) return "预发";
  if (devPattern.test(text)) return "开发测试";
  return "未标记";
}

function detectAuthType(user: Record<string, unknown>) {
  if (typeof user.exec === "object") return "exec-plugin";
  if (typeof user.token === "string") return "static-token";
  if (typeof user["auth-provider"] === "object") return "auth-provider";
  if (typeof user["client-certificate-data"] === "string") return "client-cert";
  return "unknown";
}

function getRiskReasons(input: {
  name: string;
  namespace: string;
  environment: string;
  clusterServer: string;
  clusterInsecure: boolean;
  authType: string;
}) {
  const reasons: string[] = [];
  if (input.environment === "生产" && input.namespace === "default") {
    reasons.push("生产 context 仍使用 default namespace");
  }
  if (input.clusterInsecure) {
    reasons.push("跳过 TLS 校验");
  }
  if (input.authType === "static-token") {
    reasons.push("使用静态 token 认证");
  }
  if (!input.clusterServer.startsWith("https://")) {
    reasons.push("API Server 不是 HTTPS 地址");
  }
  if (/admin|root|cluster/i.test(input.name)) {
    reasons.push("context 名称疑似高权限入口");
  }
  return reasons;
}
